"""Scheduled reminder cron — sends push notifications before upcoming matches."""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta, timezone
from typing import Optional

from bson import ObjectId

from deps import get_db, utc_now
from services.push_service import send_push_batch

logger = logging.getLogger(__name__)

DEFAULT_REMINDER_HOURS = 24


async def check_and_send_reminders() -> int:
    """
    Scan upcoming matches in the next 48h and send push reminders to going players
    whose preferred reminder window matches now (±5 minutes). De-dupes via push_log.
    Returns count of pushes sent.
    """
    db = get_db()
    now = utc_now()
    window_end = now + timedelta(hours=48)

    sent_total = 0
    async for match in db.matches.find({
        "status": "UPCOMING",
        "start_datetime": {"$gte": now, "$lte": window_end},
    }):
        match_id = match["_id"]
        match_time = match.get("start_datetime")
        if not match_time:
            continue
        # Mongo may return tz-naive datetimes; coerce to UTC for comparisons.
        if getattr(match_time, "tzinfo", None) is None:
            match_time = match_time.replace(tzinfo=timezone.utc)
        match_name = match.get("name") or "Мач"
        venue = match.get("venue") or ""
        group_id = match.get("group_id")

        # Going RSVPs only
        going_user_ids: list[ObjectId] = []
        async for r in db.rsvps.find({
            "match_id": match_id,
            "status": "going",
            "user_id": {"$ne": None},
        }):
            uid = r.get("user_id")
            if uid:
                going_user_ids.append(uid)
        if not going_user_ids:
            continue

        async for user in db.users.find({
            "_id": {"$in": going_user_ids},
            "expo_push_token": {"$ne": None},
        }):
            prefs = user.get("push_prefs") or {}
            if prefs.get("reminders", True) is False:
                continue
            reminder_hours = int(prefs.get("reminder_hours", DEFAULT_REMINDER_HOURS) or DEFAULT_REMINDER_HOURS)
            reminder_time = match_time - timedelta(hours=reminder_hours)
            # Trigger window: [reminder_time - 5m, reminder_time + 5m]
            if not (now - timedelta(minutes=5) <= reminder_time <= now + timedelta(minutes=5)):
                continue

            mid_str = str(match_id)
            uid_str = str(user["_id"])
            already = await db.push_log.find_one({
                "match_id": mid_str,
                "user_id": uid_str,
                "type": "reminder",
            })
            if already:
                continue

            hours_left = max(1, int((match_time - now).total_seconds() / 3600))
            time_text = f"след {hours_left} часа" if hours_left > 1 else "след 1 час"
            token = user.get("expo_push_token")
            try:
                count = await send_push_batch(
                    [token],
                    title=f"Мач {time_text}!",
                    body=f"{match_name}{' — ' + venue if venue else ''}",
                    data={"type": "match", "group_id": str(group_id), "match_id": mid_str},
                    channel_id="matches",
                )
                if count:
                    sent_total += count
                # Insert log to prevent duplicates regardless of delivery success
                await db.push_log.insert_one({
                    "match_id": mid_str,
                    "user_id": uid_str,
                    "type": "reminder",
                    "sent_at": now,
                })
            except Exception as e:
                logger.warning(f"Reminder push failed for user={uid_str}: {e}")
    return sent_total


async def reminder_background_loop(interval_seconds: Optional[int] = 300):
    """Run check_and_send_reminders forever every `interval_seconds`."""
    while True:
        try:
            n = await check_and_send_reminders()
            if n > 0:
                logger.info(f"Reminder cron: sent {n} pushes")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"Reminder cron error: {e}")
        await asyncio.sleep(interval_seconds or 300)

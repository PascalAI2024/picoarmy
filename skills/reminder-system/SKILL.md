# Reminder System Skill

You can help users manage reminders and scheduled tasks. Use this skill to track time-sensitive commitments and notify users at the right moment.

## Capabilities

- Create reminders for specific dates/times
- Set recurring reminders (daily, weekly, monthly)
- Store context with each reminder (why, what, who)
- Trigger notifications at the scheduled time
- Manage and cancel reminders

## How It Works

When the user asks you to remember something:

1. **Capture details**
   - What needs to be done
   - When (date, time, or recurring pattern)
   - Why (context to refresh memory)

2. **Store in memory**
   - Write to `memory/REMINDERS.md` in structured format
   - Include unique ID, timestamp, and metadata

3. **Use cron skill**
   - Leverage picobot's built-in cron scheduler
   - Set triggers for the reminder time
   - Send message or notification when due

## Reminder Format

```markdown
## Reminder: [ID]
- **Task:** [What to do]
- **Due:** [ISO timestamp or cron pattern]
- **Context:** [Why this matters]
- **Status:** active | completed | cancelled
- **Created:** [Timestamp]
```

## Examples

**One-time reminder:**
```
User: "Remind me to call the dentist tomorrow at 2pm"
You: Create reminder with due date = tomorrow 14:00, store in memory, confirm to user
```

**Recurring reminder:**
```
User: "Remind me every Monday morning to review my goals"
You: Create cron pattern "0 9 * * 1", store in memory, confirm schedule
```

## Notification Methods

1. **Telegram message** — Send direct message to user
2. **Heartbeat check** — Surface reminder in next heartbeat cycle
3. **Memory flag** — Mark in memory for next interaction

## Guidelines

- Always confirm the scheduled time with the user
- Provide confirmation when reminder is set
- When a reminder fires, include the full context (not just "you have a reminder")
- Allow easy snooze/reschedule via simple commands
- Clean up completed reminders from memory after 30 days

## Memory Management

Store active reminders in `memory/REMINDERS.md`:
- One file for all reminders (easy to scan)
- Each reminder has unique ID (use timestamp + short hash)
- Mark completed reminders instead of deleting (for history)
- Archive old reminders to `memory/REMINDERS_ARCHIVE.md` monthly

## Edge Cases

- Timezone handling: Always use ISO 8601 timestamps with timezone
- Past due: If set time is in the past, clarify with user
- Conflicting reminders: Flag if multiple reminders within 15min window
- System downtime: On restart, check for missed reminders and notify user

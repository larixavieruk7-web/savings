Check whether this conversation's context is getting long (many tool calls, large file reads, extended back-and-forth).

If yes — run the handoff protocol:
1. Commit all work in progress
2. Note remaining items and current state
3. Write the exact prompt for the user to paste into a fresh session
4. Tell the user what to do next
5. STOP — do not continue working in this session

If no — confirm context is fine and continue with the current task.

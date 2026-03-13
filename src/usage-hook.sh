#!/bin/bash
# Claude Code Stop hook — records a ping timestamp after every assistant response.
# maw-js reads this file for near-real-time usage awareness.
#
# To enable: add to ~/.claude/settings.json under hooks.Stop:
#   {
#     "type": "command",
#     "command": "/Users/kanatekhumnin/Project/maw-js/src/usage-hook.sh"
#   }

PING_LOG="${HOME}/.claude/maw-usage-pings.log"

# Append current UTC timestamp
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${PING_LOG}"

# Keep only the last 1000 lines to prevent unbounded growth
if [ -f "${PING_LOG}" ]; then
  tail -1000 "${PING_LOG}" > "${PING_LOG}.tmp" && mv "${PING_LOG}.tmp" "${PING_LOG}"
fi

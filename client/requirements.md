## Packages
framer-motion | Smooth page transitions and UI animations
recharts | Visualizing school data and stats
date-fns | Date manipulation for calendar and schedules
react-big-calendar | Full-featured calendar component for the faculty schedule
moment | Dependency for react-big-calendar localizer

## Notes
Tailwind Config - extend fontFamily:
fontFamily: {
  display: ["'Outfit'", "sans-serif"],
  body: ["'Inter'", "sans-serif"],
}

Calendar integration expects events to match the `CalendarEvent` type from schema.
AI endpoints may take longer to respond, implement loading states accordingly.

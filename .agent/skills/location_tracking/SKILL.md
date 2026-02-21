---
name: Location Tracking
description: Client-side geolocation with smart caching, used by chat and highlights.
---

# Location Tracking

Optional geolocation support that provides location context to AI features. Once the user grants browser permission, it stays granted — no re-prompts on subsequent uses.

## Architecture

### Hook: `src/hooks/useLocation.ts`

Central location manager exposing:

```typescript
interface UseLocationResult {
  location: LocationData | null;      // Cached { lat, lng, lastUpdated }
  isTrackingEnabled: boolean;          // User toggle (persisted in localStorage)
  toggleTracking: () => void;
  getLocation: (onStatusUpdate?) => Promise<string | undefined>;  // Returns "lat,lng"
}
```

### Storage

| Key | Value |
|-----|-------|
| `user:location` | `{ lat, lng, lastUpdated }` |
| `user:location:tracking` | `"true"` or `"false"` (default: `true`) |

### Smart Caching in `getLocation()`

| Cache Age | Behavior |
|-----------|----------|
| < 1 minute | Return immediately, no refresh |
| 1–15 minutes | Return immediately, trigger background refresh |
| > 15 minutes or missing | **Wait** for `getCurrentPosition` before returning |

If waiting takes > 2 seconds, calls the optional `onStatusUpdate` callback with `"Getting location..."`.

## Integration Points

### Chat Messages (waits for location)

In `ChatView.tsx`, `sendMessage` calls `getLocation()` which may wait for GPS if location is stale. The status callback updates the streaming message status.

```typescript
// ChatView.tsx - sendMessage
location = await locationContext.getLocation((status) => {
  setMessages(prev => prev.map(msg =>
    msg.id === tempAssistantMessageId ? { ...msg, status } : msg
  ));
});

// Passed in request body
body: JSON.stringify({ message, conversationId, location, ... })
```

### Highlights (cached only, never waits)

`HighlightsSection.tsx` reads the cached location from context and passes it to the API. It never calls `getLocation()` — no blocking, no GPS wait.

```typescript
// HighlightsSection.tsx - triggerGeneration
body: JSON.stringify({
  force,
  view,
  location: locationContext.location
    ? `${locationContext.location.lat},${locationContext.location.lng}`
    : undefined,
})
```

This works because highlights run after page load, by which time any recent chat usage has already populated the cache.

### Context Provider

`useLocation()` is initialized in `ChatContext.tsx` and exposed as `location` on the context:

```typescript
// ChatContext.tsx
const location = useLocation();
// Available via useChatContext().location
```

### Toggle UI

A MapPin/MapPinOff button in `ChatView.tsx` empty state (top-right corner) toggles tracking on/off.

## Adding Location to a New Feature

Two patterns depending on whether the feature is user-initiated or automatic:

### User-initiated (like chat) — wait for fresh location

```typescript
const { location: locationContext } = useChatContext();

// In your action handler:
const location = await locationContext.getLocation((status) => {
  // Show status to user if GPS takes > 2s
});
// location is "lat,lng" or undefined
```

### Automatic (like highlights) — use cached only

```typescript
const { location: locationContext } = useChatContext();

// Read cached location, never block
const location = locationContext.location
  ? `${locationContext.location.lat},${locationContext.location.lng}`
  : undefined;
```

## Key Files

- `src/hooks/useLocation.ts` - Core hook with caching logic
- `src/app/context/ChatContext.tsx` - Provides location via context
- `src/app/components/ChatView.tsx` - Chat usage (waits) + toggle UI
- `src/app/components/HighlightsSection.tsx` - Highlights usage (cached only)

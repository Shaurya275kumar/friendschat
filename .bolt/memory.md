# Project memory

## Product intent & audience

- Mobile app (Expo/React Native) with peer-to-peer calling feature (likely video/voice).
- Target users make calls across different devices and networks; reliability is a priority.

## Brand personality & voice

- Not yet inferred.

## Visual design & UX direction

- `components/CallScreen.tsx` is UI-only; all connection logic lives in `lib/call.tsx`.
- Call UI is separated from signaling/WebRTC logic (keep this separation).

## Decisions, constraints & rationale

- **Signaling transport:** Supabase realtime table `call_signaling` (participant-scoped, realtime-enabled via migrations).
- **Clock-based message filter removed:** Each phone's local clock was used to filter signaling messages; clock skew caused missed ICE candidates. Messages now matched only to current call session.
- **Polling extended:** Previously stopped after 5 tries (~10s). Now continues until connection is established.
- **ICE restart retry:** A failed connection retries once via ICE restart before ending the call, instead of immediately terminating.
- **TURN servers:** Currently using public shared openrelay credentials — unreliable across networks. Dedicated relay (Metered or Twilio) recommended but not yet integrated.
- **No build script:** Project lacks a build script; TypeScript type checking is used as the verification step.

## Open questions & assumptions

- Dedicated TURN/relay provider not yet chosen or configured; user may provide credentials (Metered, Twilio, or similar).
- Changes have not been tested on real devices; cross-device validation still needed.
- Assumption: Supabase realtime is sufficient for signaling latency; no WebSocket fallback considered yet.
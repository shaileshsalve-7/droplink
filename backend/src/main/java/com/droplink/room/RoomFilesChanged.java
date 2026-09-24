package com.droplink.room;

import java.util.UUID;

// A notification contains a room ID, never file bytes or access credentials.
record RoomFilesChanged(UUID roomId) {}

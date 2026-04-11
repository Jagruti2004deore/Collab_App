package com.collabapp.config;

import java.util.List;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import com.collabapp.dto.PresenceMessage;
import com.collabapp.service.RoomPresenceService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketEventListener {

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomPresenceService presenceService;

    // Fired when a client connects via WebSocket
    @EventListener
    public void handleWebSocketConnect(SessionConnectedEvent event) {
        StompHeaderAccessor accessor =
            StompHeaderAccessor.wrap(event.getMessage());
        String username = getUsername(accessor);
        log.info("WebSocket connected: {}", username);
        // Actual room join happens via the /app/room/{roomId}/join endpoint
    }

    // Fired when a client disconnects (tab closed, network drop, logout)
    @EventListener
    public void handleWebSocketDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor =
            StompHeaderAccessor.wrap(event.getMessage());
        String username = getUsername(accessor);

        if (username == null) return;

        log.info("WebSocket disconnected: {}", username);

        // Find all rooms this user was in and broadcast LEAVE to each
        List<String> rooms = presenceService.getRoomsForUser(username);
        presenceService.removeUserFromAllRooms(username);

        for (String roomId : rooms) {
            PresenceMessage msg = PresenceMessage.builder()
                    .eventType(PresenceMessage.EventType.LEAVE)
                    .username(username)
                    .roomId(roomId)
                    .build();

            messagingTemplate.convertAndSend(
                "/topic/room/" + roomId + "/presence", msg);

            log.info("Broadcast LEAVE for {} in room {}", username, roomId);
        }
    }

    private String getUsername(StompHeaderAccessor accessor) {
        if (accessor.getUser() != null) {
            return accessor.getUser().getName();
        }
        // Fallback: read from session attributes set during handshake
        Object username = accessor.getSessionAttributes() != null
                ? accessor.getSessionAttributes().get("username")
                : null;
        return username != null ? username.toString() : null;
    }
}
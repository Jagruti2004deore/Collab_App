package com.collabapp.controller;

import java.security.Principal;
import java.util.List;
import java.util.Set;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.collabapp.dto.ChatMessageDTO;
import com.collabapp.dto.PresenceMessage;
import com.collabapp.service.ChatService;
import com.collabapp.service.RoomPresenceService;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final RoomPresenceService presenceService;
    private final SimpMessagingTemplate messagingTemplate;

    // ─── Chat ────────────────────────────────────────────────────────────────

    // Client sends to /app/chat/{roomId}
    @MessageMapping("/chat/{roomId}")
    public void sendMessage(@DestinationVariable String roomId,
                            @Payload ChatMessageDTO messageDTO,
                            Principal principal) {

        String sender = (principal != null)
                ? principal.getName()
                : messageDTO.getSender();

        ChatMessageDTO saved = chatService.saveMessage(
                roomId, sender, messageDTO.getContent());

        messagingTemplate.convertAndSend("/topic/room/" + roomId, saved);
    }

    // ─── Presence ────────────────────────────────────────────────────────────

    // Client sends to /app/room/{roomId}/join when entering the room
    @MessageMapping("/room/{roomId}/join")
    public void userJoin(@DestinationVariable String roomId,
                         Principal principal) {

        if (principal == null) return;
        String username = principal.getName();

        presenceService.addUser(roomId, username);

        // Broadcast JOIN event to everyone in the room
        PresenceMessage msg = PresenceMessage.builder()
                .eventType(PresenceMessage.EventType.JOIN)
                .username(username)
                .roomId(roomId)
                .build();

        messagingTemplate.convertAndSend(
                "/topic/room/" + roomId + "/presence", msg);
    }

    // Client sends to /app/room/{roomId}/leave when navigating away
    @MessageMapping("/room/{roomId}/leave")
    public void userLeave(@DestinationVariable String roomId,
                          Principal principal) {

        if (principal == null) return;
        String username = principal.getName();

        presenceService.removeUser(roomId, username);

        PresenceMessage msg = PresenceMessage.builder()
                .eventType(PresenceMessage.EventType.LEAVE)
                .username(username)
                .roomId(roomId)
                .build();

        messagingTemplate.convertAndSend(
                "/topic/room/" + roomId + "/presence", msg);
    }

    // Client sends to /app/room/{roomId}/typing
    @MessageMapping("/room/{roomId}/typing")
    public void userTyping(@DestinationVariable String roomId,
                           @Payload PresenceMessage payload,
                           Principal principal) {

        if (principal == null) return;
        String username = principal.getName();

        PresenceMessage msg = PresenceMessage.builder()
                .eventType(payload.getEventType()) // TYPING or STOP_TYPING
                .username(username)
                .roomId(roomId)
                .build();

        messagingTemplate.convertAndSend(
                "/topic/room/" + roomId + "/presence", msg);
    }

    // ─── REST ────────────────────────────────────────────────────────────────

    // GET /api/chat/{roomId}/history
    @GetMapping("/api/chat/{roomId}/history")
    public List<ChatMessageDTO> getHistory(@PathVariable String roomId) {
        return chatService.getMessageHistory(roomId);
    }

    // GET /api/rooms/{roomId}/online — returns current online users
    @GetMapping("/api/rooms/{roomId}/online")
    public Set<String> getOnlineUsers(@PathVariable String roomId) {
        return presenceService.getOnlineUsers(roomId);
    }
}
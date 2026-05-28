package com.collabapp.controller;

import java.security.Principal;
import java.util.Base64;
import java.util.List;
import java.util.Set;

import org.springframework.http.MediaType;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import com.collabapp.dto.ChatMessageDTO;
import com.collabapp.dto.PresenceMessage;
import com.collabapp.service.ChatService;
import com.collabapp.service.RoomPresenceService;
import com.collabapp.service.RoomService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequiredArgsConstructor
@Slf4j
public class ChatController {

    private final ChatService chatService;
    private final RoomPresenceService presenceService;
    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/chat/{roomId}")
public void sendMessage(@DestinationVariable String roomId,
                        @Payload ChatMessageDTO messageDTO,
                        Principal principal) {

    String sender = (principal != null)
            ? principal.getName()
            : messageDTO.getSender();

    roomService.assertCanAccess(roomId, sender);

    // Pass file fields through
    ChatMessageDTO saved = chatService.saveMessage(
            roomId,
            sender,
            messageDTO.getContent(),
            messageDTO.getType() != null ? messageDTO.getType().name() : "CHAT",
            messageDTO.getFileName(),
            messageDTO.getFileType()
    );

    messagingTemplate.convertAndSend("/topic/room/" + roomId, saved);
}

    @MessageMapping("/room/{roomId}/join")
    public void userJoin(@DestinationVariable String roomId,
                         @Payload(required = false) PresenceMessage payload,
                         Principal principal) {

        // Get username from principal OR from payload as fallback
        String username = null;
        if (principal != null) {
            username = principal.getName();
        } else if (payload != null && payload.getUsername() != null) {
            username = payload.getUsername();
        }

        if (username == null || username.isEmpty()) {
            log.warn("userJoin called with no username for room {}", roomId);
            return;
        }

        roomService.assertCanAccess(roomId, username);

        log.info("User {} joining room {}", username, roomId);
        presenceService.addUser(roomId, username);

        PresenceMessage msg = PresenceMessage.builder()
                .eventType(PresenceMessage.EventType.JOIN)
                .username(username)
                .roomId(roomId)
                .build();

        messagingTemplate.convertAndSend(
                "/topic/room/" + roomId + "/presence", msg);
    }

    @MessageMapping("/room/{roomId}/leave")
    public void userLeave(@DestinationVariable String roomId,
                          @Payload(required = false) PresenceMessage payload,
                          Principal principal) {

        String username = null;
        if (principal != null) {
            username = principal.getName();
        } else if (payload != null && payload.getUsername() != null) {
            username = payload.getUsername();
        }

        if (username == null) return;

        roomService.assertCanAccess(roomId, username);

        log.info("User {} leaving room {}", username, roomId);
        presenceService.removeUser(roomId, username);

        PresenceMessage msg = PresenceMessage.builder()
                .eventType(PresenceMessage.EventType.LEAVE)
                .username(username)
                .roomId(roomId)
                .build();

        messagingTemplate.convertAndSend(
                "/topic/room/" + roomId + "/presence", msg);
    }

    @MessageMapping("/room/{roomId}/typing")
public void userTyping(@DestinationVariable String roomId,
                       @Payload PresenceMessage payload,
                       Principal principal) {

    if (payload == null) return;

    String username = (principal != null)
            ? principal.getName()
            : payload.getUsername();

    if (username == null) return;

    roomService.assertCanAccess(roomId, username);

    PresenceMessage msg = PresenceMessage.builder()
            .eventType(payload.getEventType())
            .username(username)
            .roomId(roomId)
            .build();

    messagingTemplate.convertAndSend(
            "/topic/room/" + roomId + "/presence", msg);
}

    @GetMapping("/api/chat/{roomId}/history")
    public List<ChatMessageDTO> getHistory(@PathVariable String roomId,
                                           Principal principal) {
        roomService.assertCanAccess(roomId, principal.getName());
        return chatService.getMessageHistory(roomId);
    }

    @PostMapping(value = "/api/chat/{roomId}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ChatMessageDTO uploadFile(@PathVariable String roomId,
                                     @RequestParam("file") MultipartFile file,
                                     Principal principal) throws java.io.IOException {
        String username = principal.getName();
        roomService.assertCanAccess(roomId, username);

        String contentType = file.getContentType() != null
                ? file.getContentType()
                : MediaType.APPLICATION_OCTET_STREAM_VALUE;
        String dataUrl = "data:" + contentType + ";base64,"
                + Base64.getEncoder().encodeToString(file.getBytes());

        ChatMessageDTO saved = chatService.saveMessage(
                roomId,
                username,
                dataUrl,
                "FILE",
                file.getOriginalFilename(),
                contentType
        );

        messagingTemplate.convertAndSend("/topic/room/" + roomId, saved);
        return saved;
    }

    @GetMapping("/api/rooms/{roomId}/online")
    public Set<String> getOnlineUsers(@PathVariable String roomId,
                                      Principal principal) {
        roomService.assertCanAccess(roomId, principal.getName());
        return presenceService.getOnlineUsers(roomId);
    }
}

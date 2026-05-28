package com.collabapp.controller;

import com.collabapp.dto.NoteMessage;
import com.collabapp.service.RoomService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Controller
@RequiredArgsConstructor
public class NoteController {

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomService roomService;
    private final Map<String, NoteMessage> notesByRoom = new ConcurrentHashMap<>();

    @MessageMapping("/notes/{roomId}")
    public void handleNoteEvent(
            @DestinationVariable String roomId,
            @Payload NoteMessage message,
            Principal principal) {

        if (principal == null) return;
        String username = principal.getName();
        roomService.assertCanAccess(roomId, username);

        if (message.getAction() == NoteMessage.ActionType.HISTORY_REQ) {
            NoteMessage current = notesByRoom.getOrDefault(roomId,
                    NoteMessage.builder()
                            .action(NoteMessage.ActionType.HISTORY_RES)
                            .roomId(roomId)
                            .username(username)
                            .content("")
                            .updatedAt(LocalDateTime.now())
                            .build());
            current.setAction(NoteMessage.ActionType.HISTORY_RES);
            messagingTemplate.convertAndSendToUser(
                    username,
                    "/queue/notes-history",
                    current
            );
            return;
        }

        if (message.getAction() == NoteMessage.ActionType.UPDATE) {
            NoteMessage update = NoteMessage.builder()
                    .action(NoteMessage.ActionType.UPDATE)
                    .roomId(roomId)
                    .username(username)
                    .content(message.getContent() == null ? "" : message.getContent())
                    .updatedAt(LocalDateTime.now())
                    .build();
            notesByRoom.put(roomId, update);
            messagingTemplate.convertAndSend("/topic/notes/" + roomId, update);
        }
    }
}

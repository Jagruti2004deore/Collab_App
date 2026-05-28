package com.collabapp.controller;

import com.collabapp.dto.CodeMessage;
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
public class CodeController {

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomService roomService;
    private final Map<String, CodeMessage> codeByRoom = new ConcurrentHashMap<>();

    @MessageMapping("/code/{roomId}")
    public void handleCodeEvent(
            @DestinationVariable String roomId,
            @Payload CodeMessage message,
            Principal principal) {

        if (principal == null) return;
        String username = principal.getName();
        roomService.assertCanAccess(roomId, username);

        if (message.getAction() == CodeMessage.ActionType.HISTORY_REQ) {
            CodeMessage current = codeByRoom.getOrDefault(roomId,
                    CodeMessage.builder()
                            .action(CodeMessage.ActionType.HISTORY_RES)
                            .roomId(roomId)
                            .username(username)
                            .language("javascript")
                            .code("")
                            .updatedAt(LocalDateTime.now())
                            .build());
            current.setAction(CodeMessage.ActionType.HISTORY_RES);
            messagingTemplate.convertAndSendToUser(username, "/queue/code-history", current);
            return;
        }

        if (message.getAction() == CodeMessage.ActionType.UPDATE) {
            CodeMessage update = CodeMessage.builder()
                    .action(CodeMessage.ActionType.UPDATE)
                    .roomId(roomId)
                    .username(username)
                    .language(message.getLanguage() == null ? "javascript" : message.getLanguage())
                    .code(message.getCode() == null ? "" : message.getCode())
                    .updatedAt(LocalDateTime.now())
                    .build();
            codeByRoom.put(roomId, update);
            messagingTemplate.convertAndSend("/topic/code/" + roomId, update);
        }
    }
}

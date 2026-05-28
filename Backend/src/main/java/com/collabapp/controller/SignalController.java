package com.collabapp.controller;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.collabapp.dto.SignalMessage;
import com.collabapp.service.RoomService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Controller
@RequiredArgsConstructor
@Slf4j
public class SignalController {

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomService roomService;

    @MessageMapping("/signal/{roomId}")
    public void handleSignal(
            @DestinationVariable String roomId,
            @Payload SignalMessage signal,
            Principal principal) {

        if (principal == null) return;
        roomService.assertCanAccess(roomId, principal.getName());

        signal.setFrom(principal.getName());
        signal.setRoomId(roomId);

        String targetUser = signal.getTo();
        if (targetUser == null || targetUser.isBlank()) {
            log.warn("Signal has no target user - dropping");
            return;
        }
        if (!roomService.canAccess(roomId, targetUser)) {
            log.warn("Signal target {} is not approved for room {}", targetUser, roomId);
            return;
        }

        log.info("[Signal] {} -> {} : {}",
            signal.getFrom(), targetUser, signal.getType());

        messagingTemplate.convertAndSendToUser(
            targetUser,
            "/queue/signal",
            signal
        );
    }
}

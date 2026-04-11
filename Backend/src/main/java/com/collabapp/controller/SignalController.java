package com.collabapp.controller;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.collabapp.dto.SignalMessage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Controller
@RequiredArgsConstructor
@Slf4j
public class SignalController {

    private final SimpMessagingTemplate messagingTemplate;

    // All WebRTC signals go through /app/signal/{roomId}
    // The server just forwards them to the target user
    @MessageMapping("/signal/{roomId}")
    public void handleSignal(
            @DestinationVariable String roomId,
            @Payload SignalMessage signal,
            Principal principal) {

        if (principal == null) return;

        // Always stamp the real sender username from the JWT
        signal.setFrom(principal.getName());
        signal.setRoomId(roomId);

        String targetUser = signal.getTo();
        if (targetUser == null || targetUser.isBlank()) {
            log.warn("Signal has no target user — dropping");
            return;
        }

        log.info("[Signal] {} → {} : {}",
            signal.getFrom(), targetUser, signal.getType());

        // Forward directly to the target user's personal queue
        messagingTemplate.convertAndSendToUser(
            targetUser,
            "/queue/signal",
            signal
        );
    }
}
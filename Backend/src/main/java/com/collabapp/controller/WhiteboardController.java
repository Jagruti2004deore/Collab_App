package com.collabapp.controller;

import com.collabapp.dto.WhiteboardMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Controller
@RequiredArgsConstructor
@Slf4j
public class WhiteboardController {

    private final SimpMessagingTemplate messagingTemplate;

    // In-memory canvas history: roomId → list of draw events
    // Capped at 2000 strokes per room to prevent memory bloat
    private final Map<String, List<WhiteboardMessage>> canvasHistory =
            new ConcurrentHashMap<>();

    private static final int MAX_HISTORY = 2000;

    // Client sends draw events to /app/whiteboard/{roomId}
    @MessageMapping("/whiteboard/{roomId}")
    public void handleWhiteboardEvent(
            @DestinationVariable String roomId,
            @Payload WhiteboardMessage message,
            Principal principal) {

        String username = principal != null
                ? principal.getName()
                : message.getUsername();

        message.setUsername(username);
        message.setRoomId(roomId);

        if (message.getAction() == WhiteboardMessage.ActionType.DRAW) {
            // Save stroke to history
            canvasHistory
                .computeIfAbsent(roomId, k -> new ArrayList<>())
                .add(message);

            // Cap history size
            List<WhiteboardMessage> history = canvasHistory.get(roomId);
            if (history.size() > MAX_HISTORY) {
                history.remove(0);
            }

            // Broadcast stroke to everyone in the room
            messagingTemplate.convertAndSend(
                "/topic/whiteboard/" + roomId, message);

        } else if (message.getAction() == WhiteboardMessage.ActionType.CLEAR) {
            // Clear the stored history
            canvasHistory.remove(roomId);

            // Broadcast clear to everyone
            messagingTemplate.convertAndSend(
                "/topic/whiteboard/" + roomId, message);

            log.info("Canvas cleared for room {} by {}", roomId, username);

        } else if (message.getAction() == WhiteboardMessage.ActionType.HISTORY_REQ) {
            // A new user joined and wants the current canvas state
            List<WhiteboardMessage> history =
                canvasHistory.getOrDefault(roomId, new ArrayList<>());

            // Send history only to the requesting user's personal queue
            WhiteboardMessage response = new WhiteboardMessage();
            response.setAction(WhiteboardMessage.ActionType.HISTORY_RES);
            response.setRoomId(roomId);

            // Send each stroke individually so frontend can replay them
            for (WhiteboardMessage stroke : history) {
                messagingTemplate.convertAndSendToUser(
                    username,
                    "/queue/whiteboard-history",
                    stroke);
            }

            log.info("Sent {} history strokes to {} in room {}",
                history.size(), username, roomId);
        }
    }
}
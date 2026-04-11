package com.collabapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class PresenceMessage {

    public enum EventType {
        JOIN,       // user entered the room
        LEAVE,      // user left the room
        TYPING,     // user is typing
        STOP_TYPING // user stopped typing
    }

    private EventType eventType;
    private String username;
    private String roomId;
}
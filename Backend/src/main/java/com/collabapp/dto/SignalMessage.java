package com.collabapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class SignalMessage {

    public enum SignalType {
        CALL_OFFER,
        CALL_ANSWER,
        CALL_DECLINE,
        CALL_END,
        ICE_CANDIDATE,
        SCREEN_SHARE_START,
        SCREEN_SHARE_STOP
    }

    private SignalType type;
    private String from;
    private String to;
    private String roomId;
    private String sdp;
    private String candidate;
    private String sdpMid;
    private Integer sdpMLineIndex;
    private Boolean accepted;
}

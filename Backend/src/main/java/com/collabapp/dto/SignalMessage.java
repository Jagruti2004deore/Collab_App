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
        CALL_OFFER,      // User A wants to call User B
        CALL_ANSWER,     // User B accepted — sending WebRTC answer
        CALL_DECLINE,    // User B declined
        CALL_END,        // Either user ended the call
        ICE_CANDIDATE    // WebRTC network negotiation data
    }

    private SignalType type;

    // Who is sending this signal
    private String from;

    // Who should receive it (specific user in the room)
    private String to;

    private String roomId;

    // WebRTC session description (offer or answer SDP)
    private String sdp;

    // WebRTC ICE candidate data
    private String candidate;
    private String sdpMid;
    private Integer sdpMLineIndex;
}
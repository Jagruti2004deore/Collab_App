package com.collabapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class WhiteboardMessage {

    public enum ActionType {
        DRAW,        // a stroke segment being drawn
        CLEAR,       // someone cleared the canvas
        HISTORY_REQ, // new joiner requesting canvas history
        HISTORY_RES  // server sending back canvas history
    }

    private ActionType action;

    // Drawing coordinates
    private Double x0;
    private Double y0;
    private Double x1;
    private Double y1;

    // Stroke style
    private String color;
    private Double lineWidth;
    private Boolean isEraser;

    // Who drew this
    private String username;

    // Room context
    private String roomId;
}
package com.collabapp.controller;

import com.collabapp.dto.*;
import com.collabapp.service.RoomService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
public class RoomController {

    private final RoomService roomService;

    // POST /api/rooms — create a new room
    @PostMapping
    public ResponseEntity<RoomResponse> createRoom(
            @Valid @RequestBody CreateRoomRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {

        RoomResponse room = roomService.createRoom(request, userDetails.getUsername());
        return ResponseEntity.status(HttpStatus.CREATED).body(room);
    }

    // GET /api/rooms/my — get all rooms I created
    @GetMapping("/my")
    public ResponseEntity<List<RoomResponse>> getMyRooms(
            @AuthenticationPrincipal UserDetails userDetails) {

        return ResponseEntity.ok(roomService.getMyRooms(userDetails.getUsername()));
    }

    // GET /api/rooms/{roomId} — get room info by roomId (also validates the room exists)
    @GetMapping("/{roomId}")
    public ResponseEntity<RoomResponse> getRoom(@PathVariable String roomId) {
        return ResponseEntity.ok(roomService.getRoom(roomId));
    }

    // GET /api/rooms/{roomId}/exists — lightweight check before joining
    @GetMapping("/{roomId}/exists")
    public ResponseEntity<Map<String, Boolean>> roomExists(@PathVariable String roomId) {
        return ResponseEntity.ok(Map.of("exists", roomService.roomExists(roomId)));
    }
}
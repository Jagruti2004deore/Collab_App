package com.collabapp.controller;

import com.collabapp.dto.CreateRoomRequest;
import com.collabapp.dto.RoomAccessResponse;
import com.collabapp.dto.RoomResponse;
import com.collabapp.entity.RoomParticipant;
import com.collabapp.service.RoomService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
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
    private final SimpMessagingTemplate messagingTemplate;

    @PostMapping
    public ResponseEntity<RoomResponse> createRoom(
            @Valid @RequestBody CreateRoomRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {

        RoomResponse room = roomService.createRoom(request, userDetails.getUsername());
        return ResponseEntity.status(HttpStatus.CREATED).body(room);
    }

    @GetMapping("/my")
    public ResponseEntity<List<RoomResponse>> getMyRooms(
            @AuthenticationPrincipal UserDetails userDetails) {

        return ResponseEntity.ok(roomService.getMyRooms(userDetails.getUsername()));
    }

    @GetMapping("/joined")
    public ResponseEntity<List<RoomResponse>> getJoinedRooms(
            @AuthenticationPrincipal UserDetails userDetails) {

        return ResponseEntity.ok(roomService.getJoinedRooms(userDetails.getUsername()));
    }

    @GetMapping("/{roomId}")
    public ResponseEntity<RoomResponse> getRoom(@PathVariable String roomId) {
        return ResponseEntity.ok(roomService.getRoom(roomId));
    }

    @GetMapping("/{roomId}/exists")
    public ResponseEntity<Map<String, Boolean>> roomExists(@PathVariable String roomId) {
        return ResponseEntity.ok(Map.of("exists", roomService.roomExists(roomId)));
    }

    @GetMapping("/{roomId}/access")
    public ResponseEntity<RoomAccessResponse> getAccessStatus(
            @PathVariable String roomId,
            @AuthenticationPrincipal UserDetails userDetails) {

        return ResponseEntity.ok(
                roomService.getAccessStatus(roomId, userDetails.getUsername()));
    }

    @PostMapping("/{roomId}/join-requests")
    public ResponseEntity<RoomAccessResponse> requestJoin(
            @PathVariable String roomId,
            @AuthenticationPrincipal UserDetails userDetails) {

        RoomAccessResponse response =
                roomService.requestJoin(roomId, userDetails.getUsername());

        messagingTemplate.convertAndSendToUser(
                response.getRequestedBy(),
                "/queue/room-requests",
                response
        );

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @GetMapping("/{roomId}/join-requests")
    public ResponseEntity<List<RoomAccessResponse>> getPendingRequests(
            @PathVariable String roomId,
            @AuthenticationPrincipal UserDetails userDetails) {

        return ResponseEntity.ok(
                roomService.getPendingRequests(roomId, userDetails.getUsername()));
    }

    @PostMapping("/{roomId}/join-requests/{username}/approve")
    public ResponseEntity<RoomAccessResponse> approveRequest(
            @PathVariable String roomId,
            @PathVariable String username,
            @AuthenticationPrincipal UserDetails userDetails) {

        return ResponseEntity.ok(decide(
                roomId,
                username,
                userDetails.getUsername(),
                RoomParticipant.Status.APPROVED
        ));
    }

    @PostMapping("/{roomId}/join-requests/{username}/reject")
    public ResponseEntity<RoomAccessResponse> rejectRequest(
            @PathVariable String roomId,
            @PathVariable String username,
            @AuthenticationPrincipal UserDetails userDetails) {

        return ResponseEntity.ok(decide(
                roomId,
                username,
                userDetails.getUsername(),
                RoomParticipant.Status.REJECTED
        ));
    }

    @PostMapping("/{roomId}/join-requests/{username}/block")
    public ResponseEntity<RoomAccessResponse> blockUser(
            @PathVariable String roomId,
            @PathVariable String username,
            @AuthenticationPrincipal UserDetails userDetails) {

        return ResponseEntity.ok(decide(
                roomId,
                username,
                userDetails.getUsername(),
                RoomParticipant.Status.BLOCKED
        ));
    }

    private RoomAccessResponse decide(
            String roomId,
            String username,
            String ownerUsername,
            RoomParticipant.Status status
    ) {
        RoomAccessResponse response = roomService.decideJoinRequest(
                roomId,
                username,
                ownerUsername,
                status
        );

        messagingTemplate.convertAndSendToUser(
                username,
                "/queue/room-access",
                response
        );

        return response;
    }
}

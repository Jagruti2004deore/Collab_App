package com.collabapp.repository;

import com.collabapp.entity.Room;
import com.collabapp.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RoomRepository extends JpaRepository<Room, Long> {

    // Find a room by its public UUID (used in /room/{roomId})
    Optional<Room> findByRoomId(String roomId);

    // Get all rooms created by a specific user (for the dashboard)
    List<Room> findByCreatedByOrderByCreatedAtDesc(User createdBy);

    // Check if a room exists before joining
    boolean existsByRoomId(String roomId);
}
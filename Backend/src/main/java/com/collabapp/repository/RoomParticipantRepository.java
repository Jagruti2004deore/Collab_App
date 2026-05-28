package com.collabapp.repository;

import com.collabapp.entity.Room;
import com.collabapp.entity.RoomParticipant;
import com.collabapp.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RoomParticipantRepository extends JpaRepository<RoomParticipant, Long> {

    Optional<RoomParticipant> findByRoomAndUser(Room room, User user);

    List<RoomParticipant> findByRoomAndStatusOrderByRequestedAtAsc(
            Room room,
            RoomParticipant.Status status
    );

    boolean existsByRoomAndUserAndStatus(
            Room room,
            User user,
            RoomParticipant.Status status
    );
}

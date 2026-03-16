import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import useStore from '../store/useStore';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

const useSocket = () => {
  const socketRef = useRef(null);
  const { setConnected, updateVehicleLocation, addNotification } = useStore();

  useEffect(() => {
    // Create socket connection with better error handling
    socketRef.current = io(SOCKET_URL, {
      transports: ['polling', 'websocket'], // Try polling first, then websocket
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('✅ Connected to server');
      setConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server:', reason);
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.log('⚠️ Connection error:', error.message);
      setConnected(false);
    });

    socket.on('vehicleLocationUpdate', (data) => {
      updateVehicleLocation(data.vehicleId, data.location);
    });

    socket.on('routeUpdate', (data) => {
      addNotification({
        type: 'info',
        message: `Route ${data.routeId} has been updated`,
      });
    });

    socket.on('trafficAlert', (data) => {
      addNotification({
        type: 'warning',
        message: `Traffic alert: ${data.message}`,
      });
    });

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [setConnected, updateVehicleLocation, addNotification]);

  const emitEvent = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  return { emitEvent, socket: socketRef.current };
};

export default useSocket;
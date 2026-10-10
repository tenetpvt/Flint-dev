import asyncio
import json
import logging
from typing import Set, Dict, Any, Optional

logger = logging.getLogger("flint.backend.sse")

class SSEManager:
    """
    Central asynchronous Server-Sent Events (SSE) broker for the FLINT platform.
    Distributes real-time edge telemetry, defect discoveries, priority alerts,
    and dynamic survey route registrations to all connected web dashboards.
    """
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self.last_edge_activity: float = 0.0

    def record_edge_activity(self) -> None:
        import time
        self.last_edge_activity = time.time()

    def is_edge_active(self, timeout_sec: float = 4.0) -> bool:
        import time
        return (time.time() - self.last_edge_activity) < timeout_sec

    def subscribe(self) -> asyncio.Queue:
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        q = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        logger.info(f"SSE subscriber connected. Active clients: {len(self._subscribers)}")
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)
        logger.info(f"SSE subscriber disconnected. Active clients: {len(self._subscribers)}")

    async def broadcast(self, event_type: str, data: Dict[str, Any]) -> None:
        if not self._subscribers:
            return
        payload = json.dumps({"type": event_type, "data": data})
        message = f"data: {payload}\n\n"
        dead_queues = []
        for q in list(self._subscribers):
            try:
                q.put_nowait(message)
            except (asyncio.QueueFull, Exception):
                dead_queues.append(q)
        for q in dead_queues:
            self._subscribers.discard(q)

    def broadcast_sync(self, event_type: str, data: Dict[str, Any]) -> None:
        """Invoke broadcast thread-safely whether from a worker thread or async loop."""
        if not self._loop or not self._loop.is_running():
            try:
                self._loop = asyncio.get_running_loop()
            except RuntimeError:
                pass

        if self._loop and self._loop.is_running():
            try:
                asyncio.run_coroutine_threadsafe(self.broadcast(event_type, data), self._loop)
            except Exception as e:
                logger.warning(f"Error in run_coroutine_threadsafe: {e}")
        else:
            logger.warning("No running asyncio event loop found to dispatch SSE broadcast.")

sse_manager = SSEManager()

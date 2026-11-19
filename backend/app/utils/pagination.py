from __future__ import annotations

import math
from typing import Any, Dict, Sequence, Tuple, TypeVar

T = TypeVar("T")


def paginate_sequence(
    items: Sequence[T],
    page: int = 1,
    page_size: int = 20,
) -> Tuple[Sequence[T], Dict[str, Any]]:
    safe_page = max(1, page)
    safe_size = max(1, min(100, page_size))
    total = len(items)
    total_pages = max(1, math.ceil(total / safe_size)) if total > 0 else 1
    start = (safe_page - 1) * safe_size
    end = start + safe_size
    return items[start:end], {
        "page": safe_page,
        "page_size": safe_size,
        "total": total,
        "total_pages": total_pages,
    }


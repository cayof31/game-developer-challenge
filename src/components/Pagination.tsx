import './Pagination.css';

export interface PaginationProps {
  /** 1-based current page */
  page: number;
  /** total number of pages */
  pageCount: number;
  onPageChange: (page: number) => void;
}

/**
 * Pagination structure for the Ranking and Match History lists: Previous /
 * Next with disabled edges and a polite page status. With a single page
 * there is nothing to paginate, so nothing renders.
 */
export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount < 2) return null;
  const current = Math.min(Math.max(page, 1), pageCount);
  return (
    <nav className="pager" aria-label="Pagination">
      <button
        type="button"
        className="pager__btn"
        disabled={current <= 1}
        onClick={() => onPageChange(current - 1)}
      >
        Previous
      </button>
      <span className="pager__status" aria-live="polite">
        Page {current} of {pageCount}
      </span>
      <button
        type="button"
        className="pager__btn"
        disabled={current >= pageCount}
        onClick={() => onPageChange(current + 1)}
      >
        Next
      </button>
    </nav>
  );
}

export default Pagination;

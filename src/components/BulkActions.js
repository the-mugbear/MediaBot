import React from 'react';

const BulkActions = ({
  selectedFilesCount,
  bulkFetching,
  bulkProgress,
  onSelectAll,
  onDeselectAll,
  onClearAll,
  onBulkFetchMetadata
}) => {
  return (
    <div className="file-list-actions">
      <button className="btn btn-secondary" onClick={onSelectAll}>
        Select All
      </button>
      <button className="btn btn-secondary" onClick={onDeselectAll}>
        Deselect All
      </button>
      <button className="btn btn-secondary" onClick={onClearAll}>
        Clear List
      </button>
      <button 
        className="btn btn-primary" 
        onClick={onBulkFetchMetadata}
        disabled={selectedFilesCount === 0 || bulkFetching}
        title="Fetch metadata from APIs for selected files"
      >
        {bulkFetching ? (
          bulkProgress ? `⏳ ${bulkProgress.progress}% (${bulkProgress.current}/${bulkProgress.total})` : '⏳ Starting...'
        ) : (
          `🌐 Fetch Metadata (${selectedFilesCount})`
        )}
      </button>
    </div>
  );
};

export default BulkActions;
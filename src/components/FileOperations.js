import React from 'react';

const FileOperations = ({ onOpenFiles, onOpenFolder }) => {
  return (
    <div className="file-operations">
      <button className="btn btn-primary" onClick={onOpenFiles}>
        📁 Open Files
      </button>
      <button className="btn btn-primary" onClick={onOpenFolder}>
        📂 Open Folder
      </button>
    </div>
  );
};

export default FileOperations;
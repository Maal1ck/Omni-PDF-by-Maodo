import React from 'react';
import {
  GitMerge,
  Split,
  LayoutGrid,
  Minimize2,
  RotateCw,
  Image as ImageIcon,
  FileText,
  Table,
  FileCode,
  FileImage,
  FileEdit,
  Sheet,
  FileSignature,
  Stamp,
  Hash,
} from 'lucide-react';

interface ToolIconProps {
  name: string;
  className?: string;
}

export const ToolIcon: React.FC<ToolIconProps> = ({ name, className = 'w-6 h-6' }) => {
  switch (name) {
    case 'Merge':
      return <GitMerge className={className} />;
    case 'Split':
      return <Split className={className} />;
    case 'LayoutGrid':
      return <LayoutGrid className={className} />;
    case 'Minimize2':
      return <Minimize2 className={className} />;
    case 'RotateCw':
      return <RotateCw className={className} />;
    case 'Image':
      return <ImageIcon className={className} />;
    case 'FileText':
      return <FileText className={className} />;
    case 'Table':
      return <Table className={className} />;
    case 'FileCode':
      return <FileCode className={className} />;
    case 'FileImage':
      return <FileImage className={className} />;
    case 'FileEdit':
      return <FileEdit className={className} />;
    case 'Sheet':
      return <Sheet className={className} />;
    case 'FileSignature':
      return <FileSignature className={className} />;
    case 'Stamp':
      return <Stamp className={className} />;
    case 'Hash':
      return <Hash className={className} />;
    default:
      return <FileText className={className} />;
  }
};

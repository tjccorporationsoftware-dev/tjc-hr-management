import type { ReactElement } from 'react';

export interface PdfDocumentProps {
  onError: (message: string) => void;
  onLoad: (pageCount: number) => void;
  onPageChange: (page: number, pageCount: number) => void;
  uri: string;
}

export declare function PdfDocument(props: PdfDocumentProps): ReactElement;

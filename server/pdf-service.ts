import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

export async function generateApprovalPDF(approval: any, requester: any, signerSignatureUrl?: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const filename = `approval_${approval.id}.pdf`;
      const filePath = path.join(process.cwd(), 'attached_assets', filename);
      
      // 디렉토리 생성
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // 한국어 폰트
      const fontPath = '/System/Library/Fonts/AppleSDGothicNeo.ttc';
      if (fs.existsSync(fontPath)) {
        doc.font(fontPath, 'AppleSDGothicNeo-Regular');
      }

      // 제목
      doc.fontSize(20).text('결재 문서', { align: 'center' });
      doc.moveDown();

      // 기본 정보
      doc.fontSize(12).text(`제목: ${approval.title}`);
      doc.text(`종류: ${getApprovalTypeText(approval.type)}`);
      doc.text(`신청자: ${requester.firstName || requester.username} (${requester.email || ''})`);
      doc.text(`일시: ${new Date(approval.createdAt).toLocaleString('ko-KR')}`);
      doc.moveDown();

      // 상세 내용
      doc.fontSize(14).text('상세 내용', { underline: true });
      doc.fontSize(12).text(approval.content || '');
      doc.moveDown();

      // 추가 데이터
      if (approval.data) {
        doc.fontSize(14).text('추가 데이터', { underline: true });
        doc.fontSize(10).text(JSON.stringify(approval.data, null, 2));
        doc.moveDown();
      }

      // 결재 정보
      doc.fontSize(14).text('결재 정보', { underline: true });
      doc.fontSize(12).text(`상태: ${approval.status === 'approved' ? '승인' : approval.status === 'rejected' ? '반려' : '대기'}`);
      if (approval.feedback) {
        doc.text(`결재 의견: ${approval.feedback}`);
      }
      doc.moveDown();

      // 전자 서명 이미지
      if (signerSignatureUrl) {
        try {
          const sigPath = path.join(process.cwd(), signerSignatureUrl.replace(/^\//, ''));
          if (fs.existsSync(sigPath)) {
            doc.moveDown();
            doc.fontSize(10).text('결재자 서명:', { align: 'right' });
            doc.image(sigPath, doc.page.width - 170, doc.y, { width: 100, height: 50 });
            doc.moveDown(4);
          }
        } catch (sigErr) {
          console.error('Signature image error:', sigErr);
        }
      }

      // QR 코드 (문서 검증용)
      try {
        const verifyUrl = `${process.env.APP_URL || 'https://dorunhub.com'}/verify/${approval.id}`;
        const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 120, margin: 1 });
        const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
        
        doc.fontSize(10).text('문서 검증 QR 코드', { align: 'center' });
        doc.image(qrBuffer, doc.page.width / 2 - 60, doc.y, { width: 120, height: 120 });
        doc.moveDown(7);
        doc.fontSize(8).text(`검증 URL: ${verifyUrl}`, { align: 'center' });
        doc.text(`문서 ID: ${approval.id} | 생성: ${new Date().toISOString()}`, { align: 'center' });
      } catch (qrErr) {
        console.error('QR generation failed:', qrErr);
      }

      doc.end();

      stream.on('finish', () => resolve(filePath));
      stream.on('error', (err) => reject(err));
    } catch (error) {
      reject(error);
    }
  });
}

function getApprovalTypeText(type: string): string {
  const map: Record<string, string> = {
    field_trip: '현장체험학습',
    absence: '결석계',
    transfer: '전학 신청',
    report: '보고서',
    purchase: '물품 구매',
    leave: '휴가 신청',
    expense: '경비 청구',
  };
  return map[type] || type;
}

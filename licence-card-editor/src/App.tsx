import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  CarFront,
  ChevronRight,
  CircleDollarSign,
  ClipboardPaste,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  ExternalLink,
  Home as HomeIcon,
  ImagePlus,
  RotateCcw,
  Save,
  UserRound,
} from 'lucide-react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

type DetailTab = 'licence' | 'identity' | 'age';
type ScreenName =
  | 'home'
  | 'vehicles'
  | 'licence'
  | 'payments'
  | 'profile'
  | 'licenceDetail'
  | 'registeredVehicles'
  | 'demeritPoints'
  | 'qrCodeView'
  | 'verification'
  | 'adminPanel';

type CardState = {
  photo: string;
  fullName: string;
  licenceNumber: string;
  expiryDate: string;
  licenceType: string;
  permitClass: string;
  dateOfBirth: string;
  address: string;
  addressLine2: string;
  signature: string;
  signaturePhoto: string;
  permitStatus: string;
  issueDate: string;
  p1EndDate: string;
  proficiency: string;
  otherDetails: string;
  cardNumber: string;
  ageStatus: string;
};

const exampleCard: CardState = {
  photo: '',
  fullName: 'EXAMPLE USER',
  licenceNumber: '427391044',
  expiryDate: '2028-01-01',
  licenceType: 'Car',
  permitClass: 'P1',
  dateOfBirth: '2000-01-01',
  address: '123 EXAMPLE ST',
  addressLine2: 'MELBOURNE VIC 3000',
  signature: '',
  signaturePhoto: '',
  permitStatus: 'Current',
  issueDate: '2020-01-01',
  p1EndDate: '2028-01-01',
  proficiency: 'P1',
  otherDetails: 'No additional details',
  cardNumber: '5110304142EZC',
  ageStatus: 'Over 18',
};

const queryClient = new QueryClient();

const cardKeys = Object.keys(exampleCard) as (keyof CardState)[];

function normalizeCard(input: unknown): CardState {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const next = { ...exampleCard };
  cardKeys.forEach((key) => {
    if (typeof source[key] === 'string') next[key] = source[key] as never;
  });
  if (!next.addressLine2 && next.address.includes('\n')) {
    const [line1, ...rest] = next.address.split('\n');
    next.address = line1;
    next.addressLine2 = rest.join('\n');
  }
  return next;
}

async function loadKeywordCard(keyword: string): Promise<CardState> {
  const response = await fetch('/api/licence-transfers/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword }),
  });
  const result = await response.json() as { card?: unknown; message?: string };
  if (!response.ok) throw new Error(result.message || 'The keyword request failed.');
  return normalizeCard(result.card);
}

function loadCard(): CardState {
  try {
    const stored = window.localStorage.getItem('licence-card-editor');
    return stored ? normalizeCard(JSON.parse(stored)) : exampleCard;
  } catch {
    return exampleCard;
  }
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return window.btoa(binary);
}

function decodeBase64(value: string) {
  const binary = window.atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeDetails(card: CardState) {
  return `VICROADS1-${encodeBase64(JSON.stringify(normalizeCard(card)))}`;
}

function decodePayload(value: string): unknown {
  const compact = value.trim().replace(/\s+/g, '');
  const encoded = compact.startsWith('VICROADS1-')
    ? compact.slice('VICROADS1-'.length)
    : compact;
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid details code');
  try {
    return JSON.parse(decodeBase64(encoded));
  } catch {
    throw new Error('Invalid details code');
  }
}

function decodeDetails(value: string): CardState {
  return normalizeCard(decodePayload(value));
}

function decodeVerificationDetails(value: string): CardState {
  const payload = decodePayload(value);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid verification details');
  const source = payload as Record<string, unknown>;
  const requiredFields = [
    'fullName',
    'licenceNumber',
    'expiryDate',
    'licenceType',
    'permitClass',
    'address',
    'permitStatus',
    'proficiency',
  ];
  if (requiredFields.some((field) => typeof source[field] !== 'string' || !source[field].trim())) {
    throw new Error('Missing verification details');
  }
  if (
    (source.photo !== undefined && typeof source.photo !== 'string') ||
    (source.addressLine2 !== undefined && typeof source.addressLine2 !== 'string')
  ) {
    throw new Error('Invalid verification details');
  }
  return normalizeCard(source);
}

function encodeVerificationDetails(card: CardState) {
  const payload = {
    photo: card.photo,
    fullName: card.fullName,
    licenceNumber: card.licenceNumber,
    expiryDate: card.expiryDate,
    licenceType: card.licenceType,
    permitClass: card.permitClass,
    address: card.address,
    addressLine2: card.addressLine2,
    permitStatus: card.permitStatus,
    proficiency: card.proficiency,
  };
  return `VICROADS1-${encodeBase64(JSON.stringify(payload))}`;
}
function formatAddress(card: CardState) {
  return [card.address, card.addressLine2].filter(Boolean).join('\n') || 'Not set';
}

function verificationUrlForPayload(payload: string) {
  const basePath = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const url = new URL(`${basePath}verify`, window.location.origin);
  url.searchParams.set('details', payload);
  return url.toString();
}

function verificationUrlForToken(token: string) {
  const basePath = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const url = new URL(`${basePath}verify`, window.location.origin);
  url.searchParams.set('token', token);
  return url.toString();
}

function displayDate(value: string) {
  if (!value) return 'Not set';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function displayDateUpper(value: string) {
  return displayDate(value).toUpperCase();
}

function ageFromDate(value: string) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  if (
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())
  ) {
    age -= 1;
  }
  return age >= 0 ? String(age) : '—';
}

function trimImageWhitespace(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      let left = canvas.width;
      let top = canvas.height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const alpha = pixels.data[offset + 3];
          const red = pixels.data[offset];
          const green = pixels.data[offset + 1];
          const blue = pixels.data[offset + 2];
          const isVisible = alpha > 20 && (red < 245 || green < 245 || blue < 245);
          if (isVisible) {
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
      }
      if (right < left || bottom < top) {
        resolve(dataUrl);
        return;
      }
      const padding = Math.max(4, Math.round(Math.max(right - left, bottom - top) * 0.04));
      const cropLeft = Math.max(0, left - padding);
      const cropTop = Math.max(0, top - padding);
      const cropRight = Math.min(canvas.width - 1, right + padding);
      const cropBottom = Math.min(canvas.height - 1, bottom + padding);
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropRight - cropLeft + 1;
      croppedCanvas.height = cropBottom - cropTop + 1;
      croppedCanvas.getContext('2d')?.drawImage(
        canvas,
        cropLeft,
        cropTop,
        croppedCanvas.width,
        croppedCanvas.height,
        0,
        0,
        croppedCanvas.width,
        croppedCanvas.height,
      );
      resolve(croppedCanvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

function CheckMark() {
  return (
    <span className="source-check" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="presentation">
        <path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function BottomNav({
  active,
  onNavigate,
}: {
  active: ScreenName;
  onNavigate: (screen: ScreenName) => void;
}) {
  const items = [
    { label: 'Home', screen: 'home' as const, icon: HomeIcon },
    { label: 'Vehicles', screen: 'vehicles' as const, icon: CarFront },
    { label: 'Licence', screen: 'licence' as const, icon: CreditCard },
    { label: 'Payments', screen: 'payments' as const, icon: CircleDollarSign },
    { label: 'Profile', screen: 'profile' as const, icon: UserRound },
  ];

  return (
    <nav className="source-bottom-nav" aria-label="Primary navigation">
      {items.map(({ label, screen, icon: Icon }) => {
        const selected =
          active === screen ||
          (screen === 'licence' &&
            ['licenceDetail', 'demeritPoints', 'qrCodeView'].includes(active)) ||
          (screen === 'vehicles' && active === 'registeredVehicles');
        return (
          <button
            type="button"
            key={label}
            className={selected ? 'active' : ''}
            onClick={() => onNavigate(screen)}
            data-testid={`nav-${label.toLowerCase()}`}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SourceHeader({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="source-header">
      {onBack ? (
        <button type="button" className="source-back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
      ) : (
        <span className="source-header-spacer" />
      )}
      <h1>{title}</h1>
      {children ?? <span className="source-header-spacer" />}
    </header>
  );
}

function MediaZone({
  card,
  onReveal,
}: {
  card: CardState;
  onReveal: () => void;
}) {
  return (
    <section className="source-media-zone" aria-label="Licence photo and QR code">
      <div className="source-photo">
        {card.photo ? (
          <img src={card.photo} alt="Licence photo" data-testid="img-card-photo" />
        ) : (
          <span data-testid="empty-card-photo">No photo</span>
        )}
      </div>
      <button type="button" className="source-qr-consent" onClick={onReveal}>
        <p>Presenting a QR code allows your driver licence information to be scanned and shared.</p>
        <strong>Do you consent to share your information?</strong>
        <span>Reveal QR code</span>
      </button>
    </section>
  );
}

function PermitBanner() {
  return (
    <div className="source-permit-banner">
      <img
        src={`${import.meta.env.BASE_URL}probationary-driver-licence-banner.jpeg`}
        alt="Probationary driver licence — Victoria Australia"
      />
    </div>
  );
}

function DetailTabs({
  active,
  onChange,
}: {
  active: DetailTab;
  onChange: (tab: DetailTab) => void;
}) {
  return (
    <div className="source-detail-tabs" role="tablist" aria-label="Licence details">
      {[
        ['licence', 'Licence'],
        ['identity', 'Identity'],
        ['age', 'Age'],
      ].map(([value, label]) => (
        <button
          type="button"
          key={value}
          className={active === value ? 'active' : ''}
          onClick={() => onChange(value as DetailTab)}
          role="tab"
          aria-selected={active === value}
          data-testid={`mobile-tab-${value}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PermitDetails({ card }: { card: CardState }) {
  const [showCardNumber, setShowCardNumber] = useState(false);
  const classLabel = card.permitClass || 'P1';
  return (
    <div className="source-details">
      <h2 data-testid="text-preview-name">{card.fullName || 'NAME NOT SET'}</h2>
      <div className="source-info-grid">
        <div>
          <span>Licence number</span>
          <strong data-testid="text-preview-number">{card.licenceNumber || 'Not set'}</strong>
        </div>
        <div>
          <span>Expiry</span>
          <strong data-testid="text-preview-expiry">{displayDateUpper(card.expiryDate)}</strong>
        </div>
        <div>
          <span>Licence type</span>
          <strong>
            {card.licenceType || 'Car'}{' '}
            {classLabel !== 'FULL' && <b className="source-badge">{classLabel}</b>}
          </strong>
        </div>
        <div>
          <span>Date of birth</span>
          <strong>{displayDate(card.dateOfBirth)}</strong>
        </div>
      </div>

      <div className="source-divider" />
      <div className="source-detail-block">
        <span>Address</span>
        <strong>{formatAddress(card)}</strong>
      </div>
      <div className="source-divider" />
      <div className="source-detail-block signature-block">
        <span>Signature</span>
        {card.signaturePhoto ? (
          <img src={card.signaturePhoto} alt="Uploaded signature" data-testid="img-card-signature" />
        ) : card.signature ? (
          <strong>{card.signature}</strong>
        ) : (
          <em>No signature available</em>
        )}
      </div>

      <div className="source-section-bar">
        {classLabel === 'L' ? 'Car learner permit details' : 'Car Licence detail'}
      </div>
      <div className="source-detail-list">
        <div>
          <span>Permit status</span>
          <strong className="source-status">
            <CheckMark />
            {card.permitStatus || 'Current'}
          </strong>
        </div>
        <div>
          <span>Proficiency</span>
          <strong className="source-proficiency">
            {classLabel !== 'FULL' && (
              <b className={`source-badge large ${classLabel === 'L' ? 'yellow' : ''}`}>
                {classLabel === 'L' ? 'L' : 'P'}
              </b>
            )}
            {classLabel === 'FULL' ? 'Full' : card.proficiency || classLabel}
          </strong>
        </div>
        <div>
          <span>Issue date</span>
          <strong>{displayDateUpper(card.issueDate)}</strong>
        </div>
        {classLabel === 'P1' && (
          <div>
            <span>P1 end date</span>
            <strong>{displayDateUpper(card.p1EndDate)}</strong>
          </div>
        )}
        <div>
          <span>Expiry</span>
          <strong>{displayDateUpper(card.expiryDate)}</strong>
        </div>
      </div>

      <div className="source-section-bar">Other details</div>
      <div className="source-detail-list">
        <div className="source-reveal-row">
          <span>Card number</span>
          <strong>{showCardNumber ? card.cardNumber || 'Not set' : '*******'}</strong>
          <button
            type="button"
            onClick={() => setShowCardNumber((visible) => !visible)}
            aria-label={showCardNumber ? 'Hide card number' : 'Show card number'}
          >
            {showCardNumber ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
        <div className="source-barcode-row">
          <span>Victoria Police barcode</span>
          <div className="source-barcode" aria-label="Victoria Police barcode">
            {Array.from({ length: 38 }, (_, index) => (
              <i key={index} style={{ width: `${index % 4 === 0 ? 3 : index % 3 === 0 ? 1 : 2}px` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IdentityDetails({ card }: { card: CardState }) {
  return (
    <div className="source-details source-identity-details">
      <h2>{card.fullName || 'NAME NOT SET'}</h2>
      <div className="source-detail-block">
        <span>Address</span>
        <strong>{formatAddress(card)}</strong>
      </div>
      <div className="source-detail-block signature-block">
        <span>Signature</span>
        {card.signaturePhoto ? (
          <img src={card.signaturePhoto} alt="Uploaded signature" />
        ) : card.signature ? (
          <strong>{card.signature}</strong>
        ) : (
          <em>No signature available</em>
        )}
      </div>
    </div>
  );
}

function AgeDetails({ card }: { card: CardState }) {
  return (
    <div className="source-details source-age-details">
      <span>Age status</span>
      <strong>
        <CheckMark />
        {card.ageStatus || (Number(ageFromDate(card.dateOfBirth)) >= 18 ? 'Over 18' : 'Under 18')}
      </strong>
    </div>
  );
}

function LicenceDetailScreen({
  card,
  onNavigate,
}: {
  card: CardState;
  onNavigate: (screen: ScreenName) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('licence');
  const [refreshedAt, setRefreshedAt] = useState(new Date());
  const refreshedText = refreshedAt.toLocaleString('en-AU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="source-screen source-detail-screen">
      <SourceHeader title="View details" onBack={() => onNavigate('home')}>
        <button
          type="button"
          className="source-menu-button"
          aria-label="Refresh licence"
          onClick={() => setRefreshedAt(new Date())}
        >
          <i /><i /><i />
        </button>
      </SourceHeader>
      <button
        type="button"
        className="source-refresh-line"
        onClick={() => setRefreshedAt(new Date())}
      >
        <b>Last refreshed:</b> {refreshedText}
      </button>
      <PermitBanner />
      <MediaZone card={card} onReveal={() => onNavigate('qrCodeView')} />
      <DetailTabs active={tab} onChange={setTab} />
      {tab === 'licence' && <PermitDetails card={card} />}
      {tab === 'identity' && <IdentityDetails card={card} />}
      {tab === 'age' && <AgeDetails card={card} />}
    </div>
  );
}

function VerificationScreen({
  card,
  onClose,
  standalone = false,
}: {
  card: CardState;
  onClose?: () => void;
  standalone?: boolean;
}) {
  const classLabel = card.permitClass.trim().toUpperCase() || 'P1';
  const learner = classLabel === 'L';
  const full = classLabel === 'FULL';
  const probationary = /^P\d/.test(classLabel);
  const bannerClass = learner ? 'learner' : full ? 'full' : 'p1';
  const bannerLabel = learner
    ? 'LEARNER PERMIT'
    : probationary
      ? 'PROBATIONARY DRIVER LICENCE'
      : 'DRIVER LICENCE';
  const verifiedAt = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());

  return (
    <div className={`source-screen source-verification-screen ${standalone ? 'source-verification-standalone' : ''}`}>
      <SourceHeader title="Verification of Permit">
        {!standalone && onClose && (
          <button type="button" className="source-close" onClick={onClose}>Close</button>
        )}
      </SourceHeader>
      <div className="source-verification-status">
        <CheckMark />
        <h2>Permit Verified</h2>
      </div>
      <div className={`source-verification-banner ${bannerClass} ${probationary ? 'with-image' : ''}`}>
        {probationary ? (
          <img
            className="source-verification-banner-image"
            src={`${import.meta.env.BASE_URL}probationary-driver-licence-banner.jpeg`}
            alt="Probationary driver licence, Victoria Australia"
          />
        ) : (
          <>
            <div>
              <strong>{bannerLabel}</strong>
              <span>Victoria Australia</span>
            </div>
            {!full && <b className={`source-badge large ${learner ? 'yellow' : ''}`}>{classLabel}</b>}
          </>
        )}
      </div>
      <div className="source-verification-photo-zone">
        <div className="source-verification-photo">
          {card.photo ? <img src={card.photo} alt="Verified licence photo" /> : <span>No photo</span>}
        </div>
      </div>
      <div className="source-verification-details">
        <h2>{card.fullName || 'NAME NOT SET'}</h2>
        <div className="source-verification-info-grid">
          <div>
            <span>Permit number</span>
            <strong>{card.licenceNumber || 'Not set'}</strong>
          </div>
          <div>
            <span>Expiry</span>
            <strong>{displayDate(card.expiryDate)}</strong>
          </div>
        </div>
        <div className="source-verification-block">
          <span>Address</span>
          <strong>{formatAddress(card)}</strong>
        </div>
        <div className="source-section-bar">
          {learner ? 'Car learner permit details' : 'Car Licence detail'}
        </div>
        <div className="source-verification-list">
          <div>
            <span>Permit status</span>
            <strong className="source-status"><CheckMark />{card.permitStatus || 'Current'}</strong>
          </div>
          <div>
            <span>Proficiency</span>
            <strong className="source-proficiency">
              {!full && <b className={`source-badge large ${learner ? 'yellow' : ''}`}>{classLabel}</b>}
              {learner ? 'Learner' : full ? card.proficiency || 'Full' : card.proficiency || classLabel}
            </strong>
          </div>
        </div>
        <div className="source-verification-footer">
          <span>Details verified with</span>
          <strong><i />myVicRoads.com</strong>
          <small>{verifiedAt}</small>
        </div>
      </div>
    </div>
  );
}

function QrCodeScreen({
  card,
  onClose,
  onOpenVerification,
}: {
  card: CardState;
  onClose: () => void;
  onOpenVerification: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [remaining, setRemaining] = useState(120);
  const [verificationUrl, setVerificationUrl] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const readyTimer = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(readyTimer);
  }, []);
  useEffect(() => {
    let active = true;
    setVerificationUrl('');
    setQrImage('');
    createVerificationUrl(card)
      .then((url) => {
        if (active) setVerificationUrl(url);
      })
      .catch(() => {
        if (active) {
          setVerificationUrl('');
          setQrImage('');
        }
      });
    return () => {
      active = false;
    };
  }, [card, generation]);
  useEffect(() => {
    if (!verificationUrl) return;
    let active = true;
    QRCode.toDataURL(verificationUrl, {
      width: 760,
      margin: 1,
      errorCorrectionLevel: 'L',
      color: { dark: '#101820', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (active) setQrImage(dataUrl);
      })
      .catch(() => {
        if (active) setQrImage('');
      });
    return () => {
      active = false;
    };
  }, [verificationUrl]);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => setRemaining((value) => {
      if (value <= 1) {
        setGeneration((current) => current + 1);
        return 120;
      }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [ready]);
  return (
    <div className="source-screen source-qr-screen">
      <SourceHeader title="Verify Licence">
        <button type="button" className="source-close" onClick={onClose}>Close</button>
      </SourceHeader>
      <div className="source-qr-content">
        <div className={`source-qr-code ${ready && qrImage ? 'ready' : ''}`}>
          <div className="source-qr-grid" aria-label="QR code">
            {qrImage ? <img src={qrImage} alt="QR code that opens the saved permit verification details" /> : <span>Generating QR code…</span>}
          </div>
          {(!ready || !qrImage) && <div className="source-qr-loading"><span /></div>}
        </div>
        {ready && qrImage && (
          <p className="source-qr-expiry">
            QR expires <strong>{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</strong>
          </p>
        )}
        <div className="source-qr-copy">
          <p>
            By presenting this QR code you <b>consent</b> to share<br />
            some or all of your driver licence information,<br />
            including with scanners, venues and law<br />
            enforcement agencies. They may retain your<br />
            information in accordance with their business<br />
            practices and legal requirements.
          </p>
          <h2>You're sharing:</h2>
          <ul>
            <li>Victorian driver licence photo</li>
            <li>Full name and address</li>
            <li>Licence number, type and expiry date</li>
            <li>Licence status</li>
            <li>Proficiency</li>
          </ul>
          <p className="source-qr-destination">Scanning opens a visual verification page with these saved details.</p>
          <div className="source-qr-actions">
            <button type="button" className="source-verification-link" onClick={onOpenVerification}>View verification details</button>
            {verificationUrl && (
              <a className="source-external-link" href={verificationUrl} target="_blank" rel="noreferrer">Open verification page</a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InvalidVerificationScreen() {
  const returnToEditor = () => {
    window.location.assign(import.meta.env.BASE_URL);
  };

  return (
    <div className="source-screen source-invalid-verification">
      <SourceHeader title="Verification of Permit">
        <button type="button" className="source-close" onClick={returnToEditor}>Close</button>
      </SourceHeader>
      <main className="source-invalid-verification-content">
        <div className="source-invalid-icon" aria-hidden="true">!</div>
        <h2>Verification unavailable</h2>
        <p>This QR code is missing valid permit details. Ask the permit holder to generate a new code.</p>
        <button type="button" className="source-verification-link" onClick={returnToEditor}>Return to licence editor</button>
      </main>
    </div>
  );
}
function AppCard({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="source-home-card-icon">{icon}</span>
      <strong>{title}</strong>
      {subtitle && <span>{subtitle}</span>}
    </>
  );
  return onClick ? <button type="button" className="source-home-card" onClick={onClick}>{content}</button> : <div className="source-home-card">{content}<ChevronRight size={20} /></div>;
}

function HomeScreen({
  card,
  onNavigate,
  onLogoTap,
}: {
  card: CardState;
  onNavigate: (screen: ScreenName) => void;
  onLogoTap: () => void;
}) {
  return (
    <div className="source-screen source-home-screen">
      <header className="source-home-header">
        <button type="button" className="source-home-logo" onClick={onLogoTap} aria-label="VicRoads logo">
          <span>⌁</span>
        </button>
        <h1>Hi {card.fullName.split(' ')[0] || 'User'}</h1>
      </header>
      <div className="source-home-content">
        <AppCard title="Demerit points balance" icon={<span className="source-card-symbol">0</span>} onClick={() => onNavigate('demeritPoints')} />
        <AppCard title="Registered vehicles" icon={<CarFront size={27} />} onClick={() => onNavigate('registeredVehicles')} />
      </div>
      <button type="button" className="source-home-licence" onClick={() => onNavigate('licenceDetail')}>
        <div>
          <strong>My licence</strong>
          <span>Tap to view licence</span>
        </div>
        <ChevronRight size={23} />
      </button>
      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}

const listItems = [
  ['Manage registration renewal', 'Renew your registration when it’s due'],
  ['Change your garage address', ''],
  ['Apprentice registration discount', ''],
  ['Unregistered vehicle permits', ''],
  ['My vehicle reports', ''],
];

function ListScreen({
  title,
  onBack,
  items,
  onNavigate,
  active,
}: {
  title: string;
  onBack?: () => void;
  items: [string, string, ScreenName?][];
  onNavigate: (screen: ScreenName) => void;
  active: ScreenName;
}) {
  return (
    <div className="source-screen source-list-screen">
      <SourceHeader title={title} onBack={onBack} />
      <div className="source-list-content">
        <div className="source-list-card">
          {items.map(([label, subtitle, target]) => (
            <button type="button" key={label} className="source-list-row" onClick={() => target && onNavigate(target)}>
              <span><strong>{label}</strong>{subtitle && <small>{subtitle}</small>}</span>
              <ChevronRight size={20} />
            </button>
          ))}
        </div>
      </div>
      <BottomNav active={active} onNavigate={onNavigate} />
    </div>
  );
}

function LicenceScreen({ card, onNavigate }: { card: CardState; onNavigate: (screen: ScreenName) => void }) {
  const licenceActions: [string, string, ScreenName?][] = [
    ['View demerit points', '', 'demeritPoints'],
    ['Order driver history report', ''],
    ['Update address on licence', ''],
    ['Access myLearners', ''],
    ['Replace licence', ''],
    ['Manage licence renewal', 'Renew your licence when it’s due'],
  ];
  return (
    <div className="source-screen source-list-screen">
      <SourceHeader title="Licence" />
      <div className="source-list-content">
        <button type="button" className="source-licence-card" onClick={() => onNavigate('licenceDetail')}>
          <strong>My licence</strong>
          <span>Tap to view licence</span>
          <ChevronRight size={22} />
        </button>
        <div className="source-list-card">
          {licenceActions.map(([label, subtitle, target]) => (
            <button type="button" className="source-list-row" key={label} onClick={() => target && onNavigate(target)}>
              <span><strong>{label}</strong>{subtitle && <small>{subtitle}</small>}</span>
              <ChevronRight size={20} />
            </button>
          ))}
        </div>
      </div>
      <BottomNav active="licence" onNavigate={onNavigate} />
    </div>
  );
}

function VehiclesScreen({ onNavigate }: { onNavigate: (screen: ScreenName) => void }) {
  return (
    <ListScreen
      title="Vehicles"
      items={[
        ['My registered vehicles', 'View all registered vehicles', 'registeredVehicles'],
        ...listItems.map(([title, subtitle]) => [title, subtitle] as [string, string, ScreenName?]),
      ]}
      onNavigate={onNavigate}
      active="vehicles"
    />
  );
}

function PaymentsScreen({ onNavigate }: { onNavigate: (screen: ScreenName) => void }) {
  return (
    <ListScreen
      title="Payments"
      items={[
        ['Manage payment methods', 'Store your credit card and bank account details to make payments'],
        ['Direct debit payments', 'Manage direct debit settings'],
        ['Transaction history', 'View recent transactions made using your myVicRoads account'],
      ]}
      onNavigate={onNavigate}
      active="payments"
    />
  );
}

function ProfileScreen({
  card,
  editing,
  setEditing,
  onNavigate,
  updateCard,
  handlePhoto,
  handleSignaturePhoto,
  fileInputRef,
  signatureInputRef,
  onSave,
  onImport,
}: {
  card: CardState;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  onNavigate: (screen: ScreenName) => void;
  updateCard: <K extends keyof CardState>(key: K, value: CardState[K]) => void;
  handlePhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSignaturePhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  signatureInputRef: React.RefObject<HTMLInputElement | null>;
  onSave: () => void;
  onImport: (card: CardState) => void;
}) {
  return (
    <div className="source-screen source-profile-screen">
      <SourceHeader title="Profile" />
      <div className="source-profile-content">
        <section className="source-settings-card">
          <h2>Profile and settings</h2>
          {[
            ['Personal information', true],
            ['Addresses', true],
            ['Security settings', false],
            ['Passkey settings', false],
          ].map(([label, editable]) => (
            <button type="button" className="source-settings-row" key={String(label)} onClick={() => editable && setEditing(true)}>
              <span>{label}</span>
              {editable ? <ExternalLink size={19} /> : <ChevronRight size={20} />}
            </button>
          ))}
        </section>
        <section className="source-settings-card">
          <h2>App controls</h2>
          <div className="source-settings-row source-settings-info">
            <span>Biometrics and settings<small>Enable biometrics and deactivate card or account</small></span>
            <ChevronRight size={20} />
          </div>
          <button type="button" className="source-settings-row"><span>Help and info</span><ChevronRight size={20} /></button>
          <button type="button" className="source-settings-row"><span>Provide app feedback</span><ExternalLink size={19} /></button>
        </section>
        <ProfileDataTransfer card={card} onImport={onImport} />
        {editing && (
          <ProfileEditor
            card={card}
            updateCard={updateCard}
            handlePhoto={handlePhoto}
            handleSignaturePhoto={handleSignaturePhoto}
            fileInputRef={fileInputRef}
            signatureInputRef={signatureInputRef}
            onSave={onSave}
            onClose={() => setEditing(false)}
          />
        )}
      </div>
      <BottomNav active="profile" onNavigate={onNavigate} />
    </div>
  );
}

function ProfileDataTransfer({
  card,
  onImport,
}: {
  card: CardState;
  onImport: (card: CardState) => void;
}) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [keywordCommand, setKeywordCommand] = useState('');
  const [keywordMessage, setKeywordMessage] = useState('');
  const [keywordBusy, setKeywordBusy] = useState(false);

  const copyDetails = async () => {
    const nextCode = encodeDetails(card);
    setCode(nextCode);
    try {
      await navigator.clipboard.writeText(nextCode);
      setMessage('Details code copied to your clipboard.');
    } catch {
      setMessage('Code generated. Copy it from the box below.');
    }
  };

  const pasteDetails = () => {
    try {
      onImport(decodeDetails(code));
      setMessage('Details loaded and saved on this device.');
    } catch {
      setMessage('That code is not valid. Paste a complete details code and try again.');
    }
  };

  const runKeywordCommand = async () => {
    const match = keywordCommand.trim().match(/^(.+?)\s+(save|load)$/i);
    if (!match) {
      setKeywordMessage('Type a keyword followed by save or load, for example: Izayiah save');
      return;
    }
    const keyword = match[1].trim();
    const action = match[2].toLowerCase() as 'save' | 'load';
    if (keyword.length < 3 || keyword.length > 64) {
      setKeywordMessage('Use a keyword between 3 and 64 characters.');
      return;
    }

    setKeywordBusy(true);
    setKeywordMessage('');
    try {
      if (action === 'load') {
        onImport(await loadKeywordCard(keyword));
        setKeywordMessage(`All details linked to “${keyword}” were loaded and saved on this device.`);
      } else {
        const response = await fetch('/api/licence-transfers/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword, card }),
        });
        const result = await response.json() as { message?: string };
        if (!response.ok) throw new Error(result.message || 'The keyword request failed.');
        setKeywordMessage(`All details are now linked to “${keyword}”. Send “${keyword} load” to the other person.`);
      }
    } catch (error) {
      setKeywordMessage(error instanceof Error ? error.message : 'The keyword request failed.');
    } finally {
      setKeywordBusy(false);
    }
  };

  return (
    <section className="source-transfer-card" aria-labelledby="transfer-heading">
      <div className="source-transfer-heading">
        <div>
          <span>Move saved data</span>
          <h2 id="transfer-heading">Copy or paste details</h2>
        </div>
        <Copy size={19} aria-hidden="true" />
      </div>
      <p>Move your licence details, portrait and signature between devices. Your PIN is never included.</p>
      <div className="source-transfer-actions">
        <button type="button" className="source-transfer-copy" onClick={copyDetails}>
          <Copy size={16} /> Copy details
        </button>
        <button type="button" className="source-transfer-paste" onClick={pasteDetails} disabled={!code.trim()}>
          <ClipboardPaste size={16} /> Paste details
        </button>
      </div>
      <label className="source-transfer-field">
        <span>Details code</span>
        <textarea
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setMessage('');
          }}
          placeholder="Paste a details code here"
          rows={4}
          spellCheck={false}
          aria-label="Details code"
        />
      </label>
      {message && <small className="source-transfer-message" role="status">{message}</small>}
      <div className="source-keyword-transfer">
        <h3>Keyword transfer</h3>
        <p>Type a keyword followed by <b>save</b> or <b>load</b>. Anyone with the exact keyword can load these details, so choose one that is hard to guess.</p>
        <label className="source-keyword-field">
          <span>Keyword command</span>
          <input
            value={keywordCommand}
            onChange={(event) => {
              setKeywordCommand(event.target.value);
              setKeywordMessage('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !keywordBusy) void runKeywordCommand();
            }}
            placeholder="Izayiah save"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          className="source-keyword-run"
          onClick={() => void runKeywordCommand()}
          disabled={keywordBusy || !keywordCommand.trim()}
        >
          {keywordBusy ? 'Working…' : 'Run command'}
        </button>
        {keywordMessage && <small className="source-transfer-message" role="status">{keywordMessage}</small>}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  testId: string;
}) {
  return (
    <label className="source-field">
      <span>{label}</span>
      <input id={testId} type={type} value={value} onChange={(event) => onChange(event.target.value)} data-testid={testId} />
    </label>
  );
}

function ProfileEditor({
  card,
  updateCard,
  handlePhoto,
  handleSignaturePhoto,
  fileInputRef,
  signatureInputRef,
  onSave,
  onClose,
}: {
  card: CardState;
  updateCard: <K extends keyof CardState>(key: K, value: CardState[K]) => void;
  handlePhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSignaturePhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  signatureInputRef: React.RefObject<HTMLInputElement | null>;
  onSave: () => void;
  onClose: () => void;
}) {
  const update = (key: keyof CardState) => (value: string) => updateCard(key, value as never);
  return (
    <section className="source-editor" aria-labelledby="profile-editor-heading">
      <div className="source-editor-heading">
        <div><span>Profile editor</span><h2 id="profile-editor-heading">Edit every detail</h2></div>
        <button type="button" onClick={onClose}>Done</button>
      </div>
      <div className="source-editor-card">
        <div className="source-editor-section">
          <h3>Portrait</h3>
          <div className="source-upload-row">
            <div className="source-upload-thumb">{card.photo ? <img src={card.photo} alt="Portrait preview" data-testid="img-upload-thumb" /> : <ImagePlus size={22} />}</div>
            <span><b>{card.photo ? 'Portrait ready' : 'Add a portrait'}</b><small>JPG, PNG or WEBP · kept local</small></span>
            <input ref={fileInputRef} className="source-hidden-file" type="file" accept="image/*" onChange={handlePhoto} data-testid="input-photo" />
            <button type="button" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-photo">{card.photo ? 'Replace' : 'Browse'}</button>
          </div>
        </div>
        <div className="source-editor-section">
          <h3>Personal information</h3>
          <div className="source-editor-grid">
            <Field label="Full name" value={card.fullName} onChange={update('fullName')} testId="input-full-name" />
            <Field label="Date of birth" value={card.dateOfBirth} onChange={update('dateOfBirth')} type="date" testId="input-date-of-birth" />
            <Field label="Signature" value={card.signature} onChange={update('signature')} testId="input-signature" />
            <Field label="Age status" value={card.ageStatus} onChange={update('ageStatus')} testId="input-age-status" />
          </div>
          <Field label="Address" value={card.address} onChange={update('address')} testId="input-address" />
          <Field label="Address line 2" value={card.addressLine2} onChange={update('addressLine2')} testId="input-address-line-2" />
          <div className="source-upload-row signature-upload-row">
            <div className="source-signature-thumb">{card.signaturePhoto ? <img src={card.signaturePhoto} alt="Signature preview" data-testid="img-signature" /> : '∿'}</div>
            <span><b>{card.signaturePhoto ? 'Signature image ready' : 'Optional signature image'}</b><small>Upload a transparent signature or keep the typed version</small></span>
            <input ref={signatureInputRef} className="source-hidden-file" type="file" accept="image/*" onChange={handleSignaturePhoto} data-testid="input-signature-photo" />
            <button type="button" onClick={() => signatureInputRef.current?.click()} data-testid="button-upload-signature">{card.signaturePhoto ? 'Replace' : 'Upload'}</button>
          </div>
        </div>
        <div className="source-editor-section">
          <h3>Licence details</h3>
          <div className="source-editor-grid">
            <Field label="Licence number" value={card.licenceNumber} onChange={update('licenceNumber')} testId="input-licence-number" />
            <Field label="Licence type" value={card.licenceType} onChange={update('licenceType')} testId="input-licence-type" />
            <Field label="Licence class" value={card.permitClass} onChange={update('permitClass')} testId="input-permit-class" />
            <Field label="Card number" value={card.cardNumber} onChange={update('cardNumber')} testId="input-card-number" />
            <Field label="Issue date" value={card.issueDate} onChange={update('issueDate')} type="date" testId="input-issue-date" />
            <Field label="P1 end date" value={card.p1EndDate} onChange={update('p1EndDate')} type="date" testId="input-p1-end-date" />
            <Field label="Expiry date" value={card.expiryDate} onChange={update('expiryDate')} type="date" testId="input-expiry-date" />
            <Field label="Permit status" value={card.permitStatus} onChange={update('permitStatus')} testId="input-permit-status" />
            <Field label="Proficiency" value={card.proficiency} onChange={update('proficiency')} testId="input-proficiency" />
            <Field label="Other details" value={card.otherDetails} onChange={update('otherDetails')} testId="input-other-details" />
          </div>
        </div>
        <button type="button" className="source-save-button" onClick={onSave} data-testid="button-save-profile"><Save size={17} /> Save all changes</button>
      </div>
    </section>
  );
}

function SimpleInfoScreen({
  title,
  children,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="source-screen source-info-screen">
      <SourceHeader title={title} onBack={onBack} />
      <div className="source-info-content">{children}</div>
    </div>
  );
}

function AdminPanel({
  card,
  onBack,
  onReset,
  onNavigate,
}: {
  card: CardState;
  onBack: () => void;
  onReset: () => void;
  onNavigate: (screen: ScreenName) => void;
}) {
  return (
    <SimpleInfoScreen title="Admin Panel" onBack={onBack}>
      <div className="source-admin-callout"><b>Local profile data</b><span>Five taps on the home logo opened this editor. Changes stay on this device.</span></div>
      <button type="button" className="source-admin-edit" onClick={() => onNavigate('profile')}>Open profile editor <ChevronRight size={19} /></button>
      <div className="source-admin-summary">
        <span>Current user</span><strong>{card.fullName}</strong>
        <span>Licence</span><strong>{card.licenceNumber} · {card.permitClass}</strong>
      </div>
      <button type="button" className="source-reset-button" onClick={onReset}><RotateCcw size={16} /> Restore example data</button>
    </SimpleInfoScreen>
  );
}

function PinScreen({ onComplete }: { onComplete: (loadedCard?: CardState) => void }) {
  const [pin, setPin] = useState('');
  const [transferCode, setTransferCode] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  useEffect(() => {
    if (pin.length !== 6) return;
    const timer = window.setTimeout(onComplete, 120);
    return () => window.clearTimeout(timer);
  }, [onComplete, pin]);

  const addDigit = (digit: string) => {
    setPin((current) => current.length < 6 ? `${current}${digit}` : current);
  };

  const loadSharedDetails = async () => {
    const match = transferCode.trim().match(/^(.+?)\s+load$/i);
    if (!match || match[1].trim().length < 3 || match[1].trim().length > 64) {
      setTransferMessage('Type a keyword followed by load, for example: Izayiah load');
      return;
    }

    setTransferBusy(true);
    setTransferMessage('');
    try {
      const importedCard = await loadKeywordCard(match[1].trim());
      onComplete(importedCard);
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : 'The keyword request failed.');
    } finally {
      setTransferBusy(false);
    }
  };

  return (
    <div className="pin-screen">
      <div className="pin-browser-bar">
        <div className="pin-browser-brand">
          <img src={`${import.meta.env.BASE_URL}vicroads-home-icon-192.png`} alt="" />
          <strong>licence-card-editor.replit.app</strong>
        </div>
        <span aria-hidden="true">▣</span>
      </div>
      <main className="pin-content">
        <div className="pin-lock" aria-hidden="true"><span /></div>
        <h1>Please enter your existing PIN code</h1>
        <div className="pin-dots" aria-label={`${pin.length} of 6 PIN digits entered`}>
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={index < pin.length ? 'filled' : ''} />
          ))}
        </div>
        <div className="pin-pad">
          {digits.map((digit) => (
            <button key={digit} type="button" onClick={() => addDigit(digit)} aria-label={`Enter ${digit}`}>
              {digit}
            </button>
          ))}
          <button type="button" className="pin-forgot" onClick={() => setPin('')}>Forgot?</button>
          <button type="button" onClick={() => addDigit('0')} aria-label="Enter 0">0</button>
          <button type="button" className="pin-delete" onClick={() => setPin((current) => current.slice(0, -1))} aria-label="Delete last digit">⌫</button>
        </div>
        <div className="pin-transfer">
          <strong>Loading details on a new phone?</strong>
          <span>Enter your shared keyword command to load the licence straight away.</span>
          <input
            value={transferCode}
            onChange={(event) => {
              setTransferCode(event.target.value);
              setTransferMessage('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !transferBusy) void loadSharedDetails();
            }}
            placeholder="Izayiah load"
            autoCapitalize="none"
            spellCheck={false}
            aria-label="Keyword load command"
          />
          <button type="button" onClick={() => void loadSharedDetails()} disabled={transferBusy || !transferCode.trim()}>
            {transferBusy ? 'Loading…' : 'Load shared details'}
          </button>
          {transferMessage && <small role="alert">{transferMessage}</small>}
        </div>
      </main>
    </div>
  );
}

function App() {
  const [card, setCard] = useState<CardState>(loadCard);
  const [screen, setScreen] = useState<ScreenName>('licenceDetail');
  const [unlocked, setUnlocked] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [logoTaps, setLogoTaps] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const updateCard = <K extends keyof CardState>(key: K, value: CardState[K]) => {
    setCard((current) => ({ ...current, [key]: value }));
  };
  const saveCard = () => {
    try {
      window.localStorage.setItem('licence-card-editor', JSON.stringify(card));
      setProfileEditing(false);
    } catch {
      // A browser quota error should not interrupt editing.
    }
  };
  const importCard = (nextCard: CardState) => {
    setCard(nextCard);
    try {
      window.localStorage.setItem('licence-card-editor', JSON.stringify(nextCard));
    } catch {
      // A browser quota error should not prevent the imported data from displaying.
    }
  };
  const resetCard = () => {
    setCard(exampleCard);
    window.localStorage.removeItem('licence-card-editor');
  };
  useEffect(() => {
    if (!card.signaturePhoto) return;
    let active = true;
    trimImageWhitespace(card.signaturePhoto).then((trimmed) => {
      if (active && trimmed !== card.signaturePhoto) {
        updateCard('signaturePhoto', trimmed);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const readImage = (event: ChangeEvent<HTMLInputElement>, key: 'photo' | 'signaturePhoto') => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      if (key === 'signaturePhoto') {
        trimImageWhitespace(dataUrl).then((trimmed) => updateCard(key, trimmed));
      } else {
        updateCard(key, dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };
  const handleLogoTap = () => {
    const next = logoTaps + 1;
    setLogoTaps(next);
    if (next >= 5) {
      setLogoTaps(0);
      setScreen('adminPanel');
    }
    window.setTimeout(() => setLogoTaps(0), 2000);
  };

  if (!unlocked) {
    return <PinScreen onComplete={(loadedCard) => {
      if (loadedCard) importCard(loadedCard);
      setUnlocked(true);
    }} />;
  }

  return (
    <div className="source-app">
      {screen === 'home' && <HomeScreen card={card} onNavigate={setScreen} onLogoTap={handleLogoTap} />}
      {screen === 'vehicles' && <VehiclesScreen onNavigate={setScreen} />}
      {screen === 'licence' && <LicenceScreen card={card} onNavigate={setScreen} />}
      {screen === 'payments' && <PaymentsScreen onNavigate={setScreen} />}
      {screen === 'profile' && (
        <ProfileScreen
          card={card}
          editing={profileEditing}
          setEditing={setProfileEditing}
          onNavigate={setScreen}
          updateCard={updateCard}
          handlePhoto={(event) => readImage(event, 'photo')}
          handleSignaturePhoto={(event) => readImage(event, 'signaturePhoto')}
          fileInputRef={fileInputRef}
          signatureInputRef={signatureInputRef}
          onSave={saveCard}
          onImport={importCard}
        />
      )}
      {screen === 'licenceDetail' && <LicenceDetailScreen card={card} onNavigate={setScreen} />}
      {screen === 'qrCodeView' && (
        <QrCodeScreen
          card={card}
          onClose={() => setScreen('licenceDetail')}
          onOpenVerification={() => setScreen('verification')}
        />
      )}
      {screen === 'verification' && <VerificationScreen card={card} onClose={() => setScreen('qrCodeView')} />}
      {screen === 'registeredVehicles' && (
        <SimpleInfoScreen title="My vehicles" onBack={() => setScreen('vehicles')}>
          <div className="source-empty-state"><CarFront size={42} /><h2>No registered vehicles</h2><p>You don't have any registered vehicles yet. They will appear here once registered.</p></div>
        </SimpleInfoScreen>
      )}
      {screen === 'demeritPoints' && (
        <SimpleInfoScreen title="Demerit points" onBack={() => setScreen('home')}>
          <div className="source-demerit-card"><span>Current Balance</span><strong>0 <small>/ 12</small></strong><em>demerit points</em></div>
          <div className="source-info-panel"><h2>Information</h2><p>Demerit points are recorded against your licence when you commit certain driving offences. If you accumulate too many points, your licence may be suspended.</p></div>
          <div className="source-info-panel"><h2>Good driving record</h2><p>You currently have 0 demerit points. Keep up the safe driving!</p></div>
        </SimpleInfoScreen>
      )}
      {screen === 'adminPanel' && <AdminPanel card={card} onBack={() => setScreen('home')} onReset={resetCard} onNavigate={setScreen} />}
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={App} />
      <Route path="/verify" component={VerificationRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

export default function AppRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedErrorBoundary><Router /></RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

async function createVerificationUrl(card: CardState) {
  const response = await fetch('/api/licence-verifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card }),
  });
  const result = await response.json() as { token?: string; message?: string };
  if (!response.ok || !result.token) {
    throw new Error(result.message || 'The verification QR code could not be generated.');
  }
  return verificationUrlForToken(result.token);
}

function VerificationRoute() {
  const [location] = useLocation();
  const [card, setCard] = useState<CardState | null | undefined>(undefined);
  useEffect(() => {
    const verificationUrl = window.location.href;
    window.history.pushState({ verification: true }, '', verificationUrl);
    const keepVerificationPageOpen = () => {
      window.history.pushState({ verification: true }, '', verificationUrl);
    };
    window.addEventListener('popstate', keepVerificationPageOpen);
    return () => window.removeEventListener('popstate', keepVerificationPageOpen);
  }, []);

  useEffect(() => {
    let active = true;
    const query = location.includes('?') ? location.slice(location.indexOf('?')) : window.location.search;
    const params = new URLSearchParams(query);
    const details = params.get('details');
    const token = params.get('token');

    if (details) {
      try {
        setCard(decodeVerificationDetails(details));
      } catch {
        setCard(null);
      }
      return () => {
        active = false;
      };
    }

    if (!token) {
      setCard(null);
      return () => {
        active = false;
      };
    }

    setCard(undefined);
    fetch(`/api/licence-verifications/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const result = await response.json() as { card?: unknown };
        if (!response.ok || !result.card) throw new Error('Verification unavailable');
        if (active) setCard(normalizeCard(result.card));
      })
      .catch(() => {
        if (active) setCard(null);
      });
    return () => {
      active = false;
    };
  }, [location]);

  if (card === undefined) {
    return (
      <div className="source-app">
        <div className="source-screen source-invalid-verification">
          <SourceHeader title="Verification of Permit" />
          <main className="source-invalid-verification-content">
            <h2>Checking licence…</h2>
          </main>
        </div>
      </div>
    );
  }

  if (!card) {
    return <div className="source-app"><InvalidVerificationScreen /></div>;
  }

  return (
    <div className="source-app">
      <VerificationScreen
        card={card}
        standalone
      />
    </div>
  );
}

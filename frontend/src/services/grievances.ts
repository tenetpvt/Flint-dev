import { getEvidenceUrl } from '../utils/evidence';

export type GrievancePortal = 'PWD_CHHATTISGARH' | 'RMC_311' | 'NHAI' | 'TRAFFIC_POLICE';
export type GrievanceStatus = 'TRANSMITTED' | 'WARD_ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED';
export type GrievanceSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface GrievanceHistoryEvent {
  timestamp: string;
  stage: string;
  note: string;
  actor: string;
}

export interface CivicGrievance {
  id: string; // e.g. "GRV-CG-RAI-2026-0842"
  ticketRef: string; // e.g. "CPGRAMS/2026/04921" or "eNIRMAN-7721"
  alertId?: number;
  defectType: string;
  severity: GrievanceSeverity;
  confidence: number;
  corridor: string;
  streetName: string;
  lat: number;
  lon: number;
  ward: string;
  targetPortal: GrievancePortal;
  departmentName: string;
  assignedOfficer: string;
  contactPhone: string;
  submittedAt: string;
  slaDeadline: string; // ISO datetime
  status: GrievanceStatus;
  stage: 1 | 2 | 3 | 4; // 1: Transmitted, 2: Ward Assigned, 3: In Progress, 4: Resolved
  evidenceUrl?: string | null;
  videoTimestampSec?: number | null;
  busId: string;
  actionRequired: string;
  resolutionProofUrl?: string | null;
  resolutionNotes?: string | null;
  history: GrievanceHistoryEvent[];
}

const STORAGE_KEY = 'flint_civic_grievances_v1';

export const INITIAL_GRIEVANCES: CivicGrievance[] = [
  {
    id: 'GRV-CG-RAI-2026-0842',
    ticketRef: 'eNIRMAN-CG-9921',
    alertId: 18,
    defectType: 'pothole',
    severity: 'CRITICAL',
    confidence: 0.94,
    corridor: 'NH-30 Raipur-Simga Highway',
    streetName: 'NH-30 Km Marker 14.2 (Near Simga Bypass)',
    lat: 21.196648,
    lon: 81.666457,
    ward: 'PWD Division 1 - State Highway Cell',
    targetPortal: 'PWD_CHHATTISGARH',
    departmentName: 'Chhattisgarh State PWD Division 1',
    assignedOfficer: 'Er. Alok Sharma, EE (Civil)',
    contactPhone: '+91 771 223 4810',
    submittedAt: new Date(Date.now() - 14 * 3600 * 1000).toISOString(), // 14 hours ago
    slaDeadline: new Date(Date.now() + 34 * 3600 * 1000).toISOString(), // 34 hours remaining
    status: 'IN_PROGRESS',
    stage: 3,
    evidenceUrl: '/evidence/evt_BUS-01_t308_pothole_1790360919.jpg',
    videoTimestampSec: 742.16,
    busId: 'BUS-01',
    actionRequired: 'Deep asphalt cold-mix patch & mechanical vibratory roller compaction',
    history: [
      {
        timestamp: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
        stage: 'TRANSMITTED',
        note: 'Grievance dossier transmitted via Chhattisgarh e-Nirman Collaboration API with GPS evidence.',
        actor: 'FLINT Automated Gateway',
      },
      {
        timestamp: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
        stage: 'WARD_ASSIGNED',
        note: 'Assigned to PWD Division 1 Field Crew #2 (Simga Sub-division).',
        actor: 'Superintending Engineer PWD',
      },
      {
        timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        stage: 'IN_PROGRESS',
        note: 'Crew deployed on-site; surface excavation & tack coat application in progress.',
        actor: 'Er. Alok Sharma, EE',
      },
    ],
  },
  {
    id: 'GRV-CG-RAI-2026-0419',
    ticketRef: 'RMC-311-2026-1044',
    alertId: 20,
    defectType: 'pothole',
    severity: 'HIGH',
    confidence: 0.88,
    corridor: 'GE Road Arterial Corridor',
    streetName: 'GE Road (Opposite City Center Mall, Telibandha)',
    lat: 21.2415,
    lon: 81.6335,
    ward: 'Ward 12 - Telibandha Zone',
    targetPortal: 'RMC_311',
    departmentName: 'Raipur Municipal Corporation (RMC 311 / Nidan)',
    assignedOfficer: 'Er. Rajesh Sahu, Ward Zonal Officer',
    contactPhone: '+91 771 242 8820',
    submittedAt: new Date(Date.now() - 38 * 3600 * 1000).toISOString(), // 38 hours ago
    slaDeadline: new Date(Date.now() + 10 * 3600 * 1000).toISOString(), // 10 hours remaining (SLA warning!)
    status: 'WARD_ASSIGNED',
    stage: 2,
    evidenceUrl: '/evidence/evt_BUS-01_t310_pothole_1790360919.jpg',
    videoTimestampSec: 742.46,
    busId: 'BUS-01',
    actionRequired: 'Bituminous leveling course and drainage curb clearance',
    history: [
      {
        timestamp: new Date(Date.now() - 38 * 3600 * 1000).toISOString(),
        stage: 'TRANSMITTED',
        note: 'Logged into Raipur Nagar Nigam 311 Civic Redressal Portal with forensic sensor data.',
        actor: 'FLINT Municipal Gateway',
      },
      {
        timestamp: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
        stage: 'WARD_ASSIGNED',
        note: 'Assigned to Ward 12 Zonal Maintenance Unit.',
        actor: 'RMC Central Control Desk',
      },
    ],
  },
  {
    id: 'GRV-CG-RAI-2026-0112',
    ticketRef: 'NHAI-RO-RAI-8802',
    alertId: 19,
    defectType: 'road_blockage',
    severity: 'CRITICAL',
    confidence: 0.91,
    corridor: 'NH-53 Bypass Outer Ring',
    streetName: 'NH-53 Flyover Junction (Km Marker 286)',
    lat: 21.196648,
    lon: 81.666457,
    ward: 'National Highway Regional Office (Raipur)',
    targetPortal: 'NHAI',
    departmentName: 'National Highways Authority of India (NHAI)',
    assignedOfficer: 'Project Director, NHAI PIU Raipur',
    contactPhone: '+91 771 251 1900',
    submittedAt: new Date(Date.now() - 52 * 3600 * 1000).toISOString(), // 52 hours ago
    slaDeadline: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), // 4 hours OVERDUE!
    status: 'TRANSMITTED',
    stage: 1,
    evidenceUrl: '/evidence/evt_BUS-01_t313_pothole_1790360919.jpg',
    videoTimestampSec: 742.26,
    busId: 'BUS-01',
    actionRequired: 'Immediate heavy machinery clearance & hazard barrier replacement',
    history: [
      {
        timestamp: new Date(Date.now() - 52 * 3600 * 1000).toISOString(),
        stage: 'TRANSMITTED',
        note: 'Submitted to MoRTH / NHAI Regional Project Cell. Priority Escalation Level 1.',
        actor: 'FLINT Edge Telemetry Ingestion',
      },
    ],
  },
  {
    id: 'GRV-CG-RAI-2026-0098',
    ticketRef: 'eNIRMAN-CG-8801',
    alertId: 23,
    defectType: 'pothole',
    severity: 'CRITICAL',
    confidence: 0.95,
    corridor: 'Pandri Commercial Corridor',
    streetName: 'Pandri Cloth Market Main Access Road',
    lat: 21.2528,
    lon: 81.6489,
    ward: 'Ward 6 - Pandri Sub-Division',
    targetPortal: 'PWD_CHHATTISGARH',
    departmentName: 'Chhattisgarh State PWD Division 1',
    assignedOfficer: 'Er. Vinay Kurrey, Assistant Engineer',
    contactPhone: '+91 771 223 4814',
    submittedAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    slaDeadline: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    status: 'RESOLVED',
    stage: 4,
    evidenceUrl: '/evidence/evt_BUS-01_t312_pothole_1790360919.jpg',
    videoTimestampSec: 742.56,
    busId: 'BUS-01',
    actionRequired: 'Cold-mix asphalt patch & structural compaction',
    resolutionProofUrl: '/evidence/pothole_01.jpg',
    resolutionNotes: 'Surface patched with 50mm mastic asphalt and re-opened for heavy bus transit. Post-inspection passed.',
    history: [
      {
        timestamp: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
        stage: 'TRANSMITTED',
        note: 'Transmitted to State PWD.',
        actor: 'FLINT Gateway',
      },
      {
        timestamp: new Date(Date.now() - 60 * 3600 * 1000).toISOString(),
        stage: 'WARD_ASSIGNED',
        note: 'Assigned to Ward 6 Civil Team.',
        actor: 'Executive Engineer',
      },
      {
        timestamp: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
        stage: 'IN_PROGRESS',
        note: 'Repair works initiated with cold-mix asphalt.',
        actor: 'Er. Vinay Kurrey',
      },
      {
        timestamp: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
        stage: 'RESOLVED',
        note: 'Quality audit passed. Photographic proof uploaded to e-Nirman portal.',
        actor: 'Field Inspector, PWD Quality Cell',
      },
    ],
  },
  {
    id: 'GRV-CG-RAI-2026-0045',
    ticketRef: 'CG-TRAFFIC-2026-031',
    alertId: 21,
    defectType: 'divider_missing',
    severity: 'MEDIUM',
    confidence: 0.85,
    corridor: 'VIP Road Corridor',
    streetName: 'VIP Road (Airport Approach Curve)',
    lat: 21.1855,
    lon: 81.6720,
    ward: 'Traffic Police Safety Cell',
    targetPortal: 'TRAFFIC_POLICE',
    departmentName: 'Raipur Traffic Police Infrastructure Cell',
    assignedOfficer: 'Insp. Mahendra Verma, Traffic Planning',
    contactPhone: '+91 771 244 5500',
    submittedAt: new Date(Date.now() - 80 * 3600 * 1000).toISOString(),
    slaDeadline: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    status: 'RESOLVED',
    stage: 4,
    evidenceUrl: '/evidence/evt_BUS-01_t311_pothole_1790360919.jpg',
    videoTimestampSec: 742.46,
    busId: 'BUS-01',
    actionRequired: 'Retroreflective median bollards and warning solar blinkers installed',
    resolutionProofUrl: '/evidence/pothole_01.jpg',
    resolutionNotes: 'Median channelizers re-installed and reflective warning blinkers deployed.',
    history: [
      {
        timestamp: new Date(Date.now() - 80 * 3600 * 1000).toISOString(),
        stage: 'TRANSMITTED',
        note: 'Transmitted to Traffic Police Safety Desk.',
        actor: 'FLINT Safety Module',
      },
      {
        timestamp: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
        stage: 'RESOLVED',
        note: 'Installation completed.',
        actor: 'Insp. Mahendra Verma',
      },
    ],
  },
];

export function getStoredGrievances(): CivicGrievance[] {
  if (typeof window === 'undefined') return INITIAL_GRIEVANCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_GRIEVANCES));
      return INITIAL_GRIEVANCES;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load stored grievances:', e);
    return INITIAL_GRIEVANCES;
  }
}

export function saveGrievances(list: CivicGrievance[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save grievances:', e);
  }
}

export function createGrievance(data: Partial<CivicGrievance>): CivicGrievance {
  const current = getStoredGrievances();
  const nextNum = Math.floor(1000 + Math.random() * 9000);
  const id = `GRV-CG-RAI-2026-${nextNum}`;
  const now = new Date();
  
  // 48 hour SLA for Critical/High, 72h for Medium/Low
  const slaHours = (data.severity === 'CRITICAL' || data.severity === 'HIGH') ? 48 : 72;
  const slaDeadline = new Date(now.getTime() + slaHours * 3600 * 1000).toISOString();

  let deptName = 'Chhattisgarh State PWD Division 1';
  let officer = 'Er. Alok Sharma, EE (Civil)';
  let phone = '+91 771 223 4810';
  let ticketRef = `eNIRMAN-CG-${nextNum}`;

  if (data.targetPortal === 'RMC_311') {
    deptName = 'Raipur Municipal Corporation (RMC 311)';
    officer = 'Er. Rajesh Sahu, Ward Zonal Officer';
    phone = '+91 771 242 8820';
    ticketRef = `RMC-311-2026-${nextNum}`;
  } else if (data.targetPortal === 'NHAI') {
    deptName = 'National Highways Authority of India (NHAI)';
    officer = 'Project Director, NHAI PIU Raipur';
    phone = '+91 771 251 1900';
    ticketRef = `NHAI-RO-RAI-${nextNum}`;
  } else if (data.targetPortal === 'TRAFFIC_POLICE') {
    deptName = 'Raipur Traffic Police Infrastructure Cell';
    officer = 'Insp. Mahendra Verma, Traffic Planning';
    phone = '+91 771 244 5500';
    ticketRef = `CG-TRAFFIC-2026-${nextNum}`;
  }

  const newGrievance: CivicGrievance = {
    id,
    ticketRef,
    alertId: data.alertId,
    defectType: data.defectType || 'pothole',
    severity: data.severity || 'HIGH',
    confidence: data.confidence || 0.92,
    corridor: data.corridor || 'GE Road Corridor',
    streetName: data.streetName || 'GE Road (Opposite City Center)',
    lat: data.lat || 21.2415,
    lon: data.lon || 81.6335,
    ward: data.ward || 'Ward 4 - Civil Lines',
    targetPortal: data.targetPortal || 'PWD_CHHATTISGARH',
    departmentName: deptName,
    assignedOfficer: officer,
    contactPhone: phone,
    submittedAt: now.toISOString(),
    slaDeadline,
    status: 'TRANSMITTED',
    stage: 1,
    evidenceUrl: data.evidenceUrl,
    videoTimestampSec: data.videoTimestampSec,
    busId: data.busId || 'BUS-01',
    actionRequired: data.actionRequired || 'Inspection, cold-mix asphalt patch and structural compaction',
    history: [
      {
        timestamp: now.toISOString(),
        stage: 'TRANSMITTED',
        note: `Transmitted to ${deptName} via Government Collaboration API with forensic image and GPS verification.`,
        actor: 'FLINT Urban Sensing Gateway',
      },
    ],
  };

  const updated = [newGrievance, ...current];
  saveGrievances(updated);
  return newGrievance;
}

export function advanceGrievanceStage(id: string): CivicGrievance | null {
  const current = getStoredGrievances();
  const index = current.findIndex(g => g.id === id);
  if (index === -1) return null;

  const target = { ...current[index] };
  const now = new Date().toISOString();

  if (target.stage === 1) {
    target.stage = 2;
    target.status = 'WARD_ASSIGNED';
    target.history.push({
      timestamp: now,
      stage: 'WARD_ASSIGNED',
      note: `Government Collaboration API Webhook: Ticket assigned to Ward Engineer ${target.assignedOfficer}.`,
      actor: `${target.departmentName} Dispatch Desk`,
    });
  } else if (target.stage === 2) {
    target.stage = 3;
    target.status = 'IN_PROGRESS';
    target.history.push({
      timestamp: now,
      stage: 'IN_PROGRESS',
      note: 'Field repair unit dispatched on-site; excavation & surfacing in progress.',
      actor: `${target.assignedOfficer}`,
    });
  } else if (target.stage === 3) {
    target.stage = 4;
    target.status = 'RESOLVED';
    target.resolutionProofUrl = target.evidenceUrl ? getEvidenceUrl(target.evidenceUrl) : '/evidence/pothole_01.jpg';
    target.resolutionNotes = 'Work verified and approved by Municipal Ward Inspector. Photographic proof recorded.';
    target.history.push({
      timestamp: now,
      stage: 'RESOLVED',
      note: 'Resolution verified with post-inspection audit. Closed in Government Redressal Portal.',
      actor: 'Municipal Quality Audit Cell',
    });
  }

  current[index] = target;
  saveGrievances(current);
  return target;
}

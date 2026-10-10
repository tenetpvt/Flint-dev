import { useState, useEffect } from 'react';
import { X, Calculator, RotateCcw, Check, Sparkles, AlertCircle } from 'lucide-react';
import type { UnitRatesConfig } from '../../services/costEstimation';

interface UnitRatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rates: UnitRatesConfig;
  onSave: (newRates: UnitRatesConfig) => Promise<void>;
  onReset: () => Promise<void>;
}

export function UnitRatesModal({
  isOpen,
  onClose,
  rates,
  onSave,
  onReset,
}: UnitRatesModalProps) {
  const [formData, setFormData] = useState<UnitRatesConfig>(rates);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    setFormData(rates);
  }, [rates]);

  if (!isOpen) return null;

  const handleInputChange = (field: keyof UnitRatesConfig, val: string) => {
    const num = parseFloat(val);
    setFormData((prev) => ({
      ...prev,
      [field]: isNaN(num) ? 0 : num,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg('');
    try {
      await onSave(formData);
      setSuccessMsg('Unit rates updated and budget recalculated.');
      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 1200);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await onReset();
      setSuccessMsg('Reset to standard CPWD baseline rates.');
      setTimeout(() => setSuccessMsg(''), 2000);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0b0e14] border border-[#414752] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#12161f] border-b border-[#414752]/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#38bdf8]/15 border border-[#38bdf8]/30 flex items-center justify-center text-[#38bdf8]">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-['Inter'] text-sm font-bold text-[#e0e2ea] tracking-tight">
                MUNICIPAL UNIT RATE SCHEDULE
              </h3>
              <p className="font-['JetBrains_Mono'] text-[11px] text-[#8b949e]">
                Baseline Cost Tuning · CPWD Schedule of Rates (SoR)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-[#c0c7d4] hover:text-[#e0e2ea] hover:bg-[#272a30] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3 flex items-start gap-2.5 text-xs text-[#94a3b8]">
            <AlertCircle className="w-4 h-4 text-[#38bdf8] shrink-0 mt-0.5" />
            <span>
              Adjusting these unit rates dynamically re-evaluates all itemized repair costs, corridor totals, and work order exports.
            </span>
          </div>

          <div className="space-y-3.5">
            {/* Cold-Mix Patch Rate */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-['Inter'] text-xs font-semibold text-[#cbd5e1]">
                  Cold-Mix Patch Rate (Tier 1 Surface Wear)
                </label>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#64748b]">₹ / sq.m</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#64748b] font-['JetBrains_Mono']">
                  ₹
                </span>
                <input
                  type="number"
                  min="100"
                  step="50"
                  value={formData.cold_mix_rate_sq_m || ''}
                  onChange={(e) => handleInputChange('cold_mix_rate_sq_m', e.target.value)}
                  className="w-full bg-[#101419] border border-[#414752] rounded-xl py-2 pl-8 pr-3 text-sm text-[#e0e2ea] font-['JetBrains_Mono'] focus:outline-none focus:border-[#38bdf8]"
                  required
                />
              </div>
            </div>

            {/* Hot-Mix Asphalt Rate */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-['Inter'] text-xs font-semibold text-[#cbd5e1]">
                  Hot-Mix Asphalt Rate (Tier 2/3 Moderate to Deep)
                </label>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#64748b]">₹ / sq.m</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#64748b] font-['JetBrains_Mono']">
                  ₹
                </span>
                <input
                  type="number"
                  min="500"
                  step="50"
                  value={formData.hot_mix_rate_sq_m || ''}
                  onChange={(e) => handleInputChange('hot_mix_rate_sq_m', e.target.value)}
                  className="w-full bg-[#101419] border border-[#414752] rounded-xl py-2 pl-8 pr-3 text-sm text-[#e0e2ea] font-['JetBrains_Mono'] focus:outline-none focus:border-[#38bdf8]"
                  required
                />
              </div>
            </div>

            {/* Full-Depth Excavation Rate */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-['Inter'] text-xs font-semibold text-[#cbd5e1]">
                  Full-Depth Excavation Rate (Tier 4 Structural Hazard)
                </label>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#64748b]">₹ / sq.m</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#64748b] font-['JetBrains_Mono']">
                  ₹
                </span>
                <input
                  type="number"
                  min="1000"
                  step="100"
                  value={formData.full_depth_rate_sq_m || ''}
                  onChange={(e) => handleInputChange('full_depth_rate_sq_m', e.target.value)}
                  className="w-full bg-[#101419] border border-[#414752] rounded-xl py-2 pl-8 pr-3 text-sm text-[#e0e2ea] font-['JetBrains_Mono'] focus:outline-none focus:border-[#38bdf8]"
                  required
                />
              </div>
            </div>

            {/* Mobilization Overhead */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-['Inter'] text-xs font-semibold text-[#cbd5e1]">
                  Mobilization & Safety Overhead
                </label>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#64748b]">₹ / site</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#64748b] font-['JetBrains_Mono']">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={formData.mobilization_overhead || ''}
                  onChange={(e) => handleInputChange('mobilization_overhead', e.target.value)}
                  className="w-full bg-[#101419] border border-[#414752] rounded-xl py-2 pl-8 pr-3 text-sm text-[#e0e2ea] font-['JetBrains_Mono'] focus:outline-none focus:border-[#38bdf8]"
                  required
                />
              </div>
            </div>
          </div>

          {successMsg && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-[#414752]/50">
            <button
              type="button"
              onClick={handleReset}
              disabled={isResetting || isSaving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-[#94a3b8] hover:text-[#e0e2ea] hover:bg-[#1f242d] transition-colors cursor-pointer border border-[#30363d]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#94a3b8] hover:text-[#e0e2ea] hover:bg-[#1f242d] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-[#38bdf8] text-[#00315c] hover:bg-[#38bdf8]/90 transition-colors shadow-md shadow-[#38bdf8]/20 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <span>Updating...</span>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Apply Rates</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

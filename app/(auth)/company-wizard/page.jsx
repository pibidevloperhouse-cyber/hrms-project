"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";

function WizardContent() {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [wizardData, setWizardData] = useState({
    legalName: "",
    industry: "",
    establishedYear: new Date().getFullYear().toString(),
    country: "",
    state: "",
    address: "",
    logoUrl: "",
  });

  const industries = [
    "Information Technology & Software",
    "Healthcare & Life Sciences",
    "Finance & Banking",
    "E-Commerce & Retail",
    "Manufacturing & Logistics",
    "Education & EdTech",
    "Services & Consulting",
    "Other",
  ];

  // Load existing company profile via authenticated session
  useEffect(() => {
    async function loadCompanyProfile() {
      try {
        const res = await fetch("/api/company/setup");
        if (!res.ok) return;

        const data = await res.json();
        if (data.company) {
          setWizardData({
            legalName: data.company.legal_name || data.company.name || "",
            industry: data.company.industry || "",
            establishedYear: String(data.company.established_year || new Date().getFullYear()),
            country: data.company.country || "",
            state: data.company.state || "",
            address: data.company.address || "",
            logoUrl: data.company.logo_url || "",
          });
        }
      } catch (err) {
        console.error("Failed to load company setup data:", err);
      }
    }

    loadCompanyProfile();
  }, []);

  const handleChange = (e) => {
    setWizardData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  // Step 1 Validation
  const validateStep1 = () => {
    if (!wizardData.legalName.trim()) {
      setErrorMessage("Please enter your Legal Company Name.");
      return false;
    }
    if (!wizardData.industry) {
      setErrorMessage("Please select an Industry.");
      return false;
    }
    if (!wizardData.establishedYear || isNaN(wizardData.establishedYear)) {
      setErrorMessage("Please enter a valid Established Year (e.g. 2024).");
      return false;
    }
    setErrorMessage("");
    return true;
  };

  // Step 2 Validation
  const validateStep2 = () => {
    if (!wizardData.country.trim()) {
      setErrorMessage("Please enter your Country.");
      return false;
    }
    if (!wizardData.state.trim()) {
      setErrorMessage("Please enter your State or Province.");
      return false;
    }
    setErrorMessage("");
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setErrorMessage("");
    setCurrentStep((prev) => prev - 1);
  };

  // Convert uploaded logo image to Data URL
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setErrorMessage("Logo image size should be less than 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setWizardData((prev) => ({ ...prev, logoUrl: reader.result }));
        setErrorMessage("");
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Company Setup Profile
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/company/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: wizardData.legalName.trim(),
          industry: wizardData.industry,
          establishedYear: wizardData.establishedYear,
          country: wizardData.country.trim(),
          state: wizardData.state.trim(),
          address: wizardData.address.trim(),
          logoUrl: wizardData.logoUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setErrorMessage(result.message || "Failed to save company profile.");
      } else {
        setSuccessMessage("🎉 Company Profile Complete! Redirecting to your dashboard...");
        setTimeout(() => {
          router.push("/dashboard");
        }, 1200);
      }
    } catch (err) {
      console.error("Wizard Submit Error:", err);
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-sky-100 text-slate-800 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-2xl bg-white border border-sky-100 rounded-3xl shadow-xl shadow-sky-500/10 p-6 sm:p-10">

        {/* Wizard Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-600 text-white mb-3 shadow-lg shadow-sky-500/25">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0V11m0 0V7" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-sky-950">Company Setup Wizard</h1>
          <p className="text-sm text-sky-700/80 mt-1">Complete your organization profile to launch your workspace</p>
        </div>

        {/* Multi-step Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between max-w-md mx-auto">
            {/* Step 1 */}
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${currentStep >= 1 ? "bg-sky-600 text-white shadow-md shadow-sky-500/30" : "bg-slate-100 text-slate-400"}`}>
                1
              </div>
              <span className="text-[11px] font-semibold text-slate-600 mt-1.5 uppercase tracking-wider">General</span>
            </div>

            <div className={`flex-1 h-1 mx-3 rounded-full transition-all duration-300 ${currentStep >= 2 ? "bg-sky-600" : "bg-slate-200"}`}></div>

            {/* Step 2 */}
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${currentStep >= 2 ? "bg-sky-600 text-white shadow-md shadow-sky-500/30" : "bg-slate-100 text-slate-400"}`}>
                2
              </div>
              <span className="text-[11px] font-semibold text-slate-600 mt-1.5 uppercase tracking-wider">Location</span>
            </div>

            <div className={`flex-1 h-1 mx-3 rounded-full transition-all duration-300 ${currentStep >= 3 ? "bg-sky-600" : "bg-slate-200"}`}></div>

            {/* Step 3 */}
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${currentStep >= 3 ? "bg-sky-600 text-white shadow-md shadow-sky-500/30" : "bg-slate-100 text-slate-400"}`}>
                3
              </div>
              <span className="text-[11px] font-semibold text-slate-600 mt-1.5 uppercase tracking-wider">Branding</span>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center space-x-2">
            <svg className="w-5 h-5 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-center space-x-2">
            <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Wizard Form */}
        <form onSubmit={handleSubmit}>

          {/* STEP 1: General & Legal Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 pb-2 border-b border-slate-100">
                1. General & Legal Information
              </h2>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">
                  Legal Company Name *
                </label>
                <input
                  type="text"
                  name="legalName"
                  value={wizardData.legalName}
                  onChange={handleChange}
                  placeholder="e.g. Apex Innovations Technologies Pvt. Ltd."
                  className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">
                    Industry *
                  </label>
                  <select
                    name="industry"
                    value={wizardData.industry}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
                  >
                    <option value="" className="text-slate-400">-- Select Industry --</option>
                    {industries.map((ind) => (
                      <option key={ind} value={ind} className="text-slate-800">{ind}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">
                    Established Year *
                  </label>
                  <input
                    type="number"
                    name="establishedYear"
                    min="1800"
                    max={new Date().getFullYear()}
                    value={wizardData.establishedYear}
                    onChange={handleChange}
                    placeholder="e.g. 2020"
                    className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition shadow-lg shadow-sky-500/25 flex items-center space-x-2"
                >
                  <span>Next Step: Location →</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Location & Address */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 pb-2 border-b border-slate-100">
                2. Location & Address
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">
                    Country *
                  </label>
                  <input
                    type="text"
                    name="country"
                    value={wizardData.country}
                    onChange={handleChange}
                    placeholder="e.g. United States, India, UK"
                    className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">
                    State / Province *
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={wizardData.state}
                    onChange={handleChange}
                    placeholder="e.g. California, London, MH"
                    className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">
                  Full Street Address
                </label>
                <textarea
                  name="address"
                  rows={3}
                  value={wizardData.address}
                  onChange={handleChange}
                  placeholder="e.g. 100 Innovation Way, Suite 400"
                  className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150 resize-none"
                />
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition shadow-lg shadow-sky-500/25 flex items-center space-x-2"
                >
                  <span>Next Step: Branding →</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Branding & Summary */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-900 pb-2 border-b border-slate-100">
                3. Company Branding & Review
              </h2>

              {/* Logo Upload Section */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-2">
                  Company Logo
                </label>

                <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 bg-sky-50/50 border border-sky-200 rounded-2xl p-4">
                  {/* Logo Preview Circle */}
                  <div className="w-20 h-20 rounded-2xl bg-white border-2 border-sky-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    {wizardData.logoUrl ? (
                      <img src={wizardData.logoUrl} alt="Company Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <svg className="w-8 h-8 text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 space-y-2 text-center sm:text-left">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      id="logo-upload"
                      className="hidden"
                    />
                    <label
                      htmlFor="logo-upload"
                      className="inline-flex items-center px-4 py-2 rounded-xl bg-white border border-sky-300 text-sky-700 text-xs font-semibold hover:bg-sky-50 cursor-pointer transition shadow-sm"
                    >
                      📁 Upload Image File
                    </label>

                    <div className="pt-1">
                      <span className="text-xs text-slate-500 block mb-1">Or paste logo image URL:</span>
                      <input
                        type="url"
                        name="logoUrl"
                        value={wizardData.logoUrl}
                        onChange={handleChange}
                        placeholder="https://company.com/logo.png"
                        className="w-full px-3 py-2 rounded-lg bg-white border border-sky-200 text-xs text-slate-800 focus:border-sky-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Review Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
                <h3 className="font-semibold text-slate-800 uppercase tracking-wider text-[11px]">Summary Review</h3>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div><strong>Legal Name:</strong> {wizardData.legalName}</div>
                  <div><strong>Industry:</strong> {wizardData.industry}</div>
                  <div><strong>Established:</strong> {wizardData.establishedYear}</div>
                  <div><strong>Country:</strong> {wizardData.country} ({wizardData.state})</div>
                </div>
              </div>

              <div className="pt-4 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition"
                >
                  ← Back
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition shadow-lg shadow-emerald-500/25 disabled:opacity-50 flex items-center space-x-2"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Saving Profile...</span>
                    </>
                  ) : (
                    <span>Complete Setup & Launch Dashboard →</span>
                  )}
                </button>
              </div>
            </div>
          )}

        </form>

      </div>
    </div>
  );
}

export default function CompanyWizardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-sky-100 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-sky-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <WizardContent />
    </Suspense>
  );
}

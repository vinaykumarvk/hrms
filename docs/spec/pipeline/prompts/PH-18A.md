# PH-18A — G01 Aadhaar vault (FR-EPM-007)
aadhaar_vault: store only a token + last-4 (never raw Aadhaar); Verhoeff checksum validation on capture
(INVALID_AADHAAR); 4-eyes/dual-auth reveal (a single actor cannot reveal); expiry/verification tracking.
Repository pattern; no secrets; no console.log. Oracle: checks/ph-18a.sh.

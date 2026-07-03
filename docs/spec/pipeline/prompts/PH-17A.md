# PH-17A — G03 leave-year close and encashment (FR-15/16)
Objective: leave_year_close (simulate->commit) computing carry-forward + lapse + HPL-conversion on the
PH-06/07 leave substrate; YEAR_ALREADY_CLOSED (double close) and PENDING_LEAVE_BLOCKS_CLOSE guards;
leave_encashment (in-service/retirement) with ENCASHMENT_CAP_EXCEEDED and NOT_ENCASHABLE. Repository
pattern; integer day/paise math; no console.log; parameterised SQL. Oracle: checks/ph-17a.sh.

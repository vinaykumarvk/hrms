import { JobService } from "../jobs/jobService";
import { MigrationStagingService } from "../migration/staging/migrationStagingService";
import { EmployeeMasterService } from "../modules/g01/employeeMasterService";
import { PersonalDetailsService } from "../modules/g02/personalDetailsService";
import { LeaveService } from "../modules/g03/leaveService";
import { LeaveSrRelayService } from "../modules/g04/leaveSrRelayService";
import { TransferService } from "../modules/g05/transferService";
import { PromotionService } from "../modules/g06/promotionService";
import { TrainingService } from "../modules/g07/trainingService";
import { AparService } from "../modules/g08/aparService";
import { DisciplinaryService } from "../modules/g09/disciplinaryService";
import { PayrollService } from "../modules/g10/payrollService";
import { PensionService } from "../modules/g11/pensionService";
import { ServiceRegisterService } from "../modules/g12/serviceRegisterService";
import { DocumentVaultService } from "../modules/g13/documentVaultService";
import { AnalyticsService } from "../modules/g14/analyticsService";
import { NotificationService } from "../notifications/notificationService";
import { ph03AuthorityFacts, ph03Documents, ph03Employees } from "../seed/ph03Seed";
import { AuditService } from "./audit/auditService";
import { AuthorityResolutionService } from "./authority-resolution/authorityResolutionService";
import { AuthorizationService } from "./authorization/authorizationService";
import { HrmsWorkflowService } from "./workflow/hrmsWorkflowService";

export interface FoundationServices {
  audit: AuditService;
  authorization: AuthorizationService;
  authorityResolution: AuthorityResolutionService;
  employeeMaster: EmployeeMasterService;
  personalDetails: PersonalDetailsService;
  leave: LeaveService;
  leaveSrRelay: LeaveSrRelayService;
  transfer: TransferService;
  promotion: PromotionService;
  training: TrainingService;
  apar: AparService;
  disciplinary: DisciplinaryService;
  payroll: PayrollService;
  pension: PensionService;
  serviceRegister: ServiceRegisterService;
  documentVault: DocumentVaultService;
  analytics: AnalyticsService;
  workflow: HrmsWorkflowService;
  jobs: JobService;
  notifications: NotificationService;
  migrationStaging: MigrationStagingService;
}

export function createFoundationServices(): FoundationServices {
  const audit = new AuditService();
  const authorization = new AuthorizationService();
  const serviceRegister = new ServiceRegisterService(audit);
  const employeeMaster = new EmployeeMasterService(ph03Employees(), authorization, audit, serviceRegister);
  const documentVault = new DocumentVaultService(ph03Documents(), audit);
  const authorityResolution = new AuthorityResolutionService(ph03AuthorityFacts());
  const notifications = new NotificationService();
  const workflow = new HrmsWorkflowService(authorityResolution, audit, notifications);
  const jobs = new JobService();
  const personalDetails = new PersonalDetailsService(employeeMaster, authorization, audit, workflow, documentVault, notifications);
  const leaveSrRelay = new LeaveSrRelayService(authorization, audit, serviceRegister, notifications);
  const leave = new LeaveService(employeeMaster, authorization, audit, workflow, leaveSrRelay, jobs, notifications);
  const transfer = new TransferService(employeeMaster, authorization, audit, workflow, serviceRegister, documentVault, notifications);
  const promotion = new PromotionService(employeeMaster, authorization, audit, workflow, serviceRegister, documentVault, notifications);
  const training = new TrainingService(employeeMaster, authorization, audit, workflow, serviceRegister, documentVault, notifications);
  const apar = new AparService(employeeMaster, authorization, audit, workflow, serviceRegister, documentVault, notifications);
  const disciplinary = new DisciplinaryService(employeeMaster, authorization, audit, workflow, serviceRegister, documentVault, notifications);
  const payroll = new PayrollService(employeeMaster, authorization, audit);
  const pension = new PensionService(employeeMaster, payroll, authorization, audit, serviceRegister, documentVault);
  const analytics = new AnalyticsService(employeeMaster, workflow, serviceRegister, documentVault, disciplinary, payroll, pension, authorization, audit);
  const migrationStaging = new MigrationStagingService(employeeMaster);
  return {
    audit,
    authorization,
    authorityResolution,
    employeeMaster,
    personalDetails,
    leave,
    leaveSrRelay,
    transfer,
    promotion,
    training,
    apar,
    disciplinary,
    payroll,
    pension,
    serviceRegister,
    documentVault,
    analytics,
    workflow,
    jobs,
    notifications,
    migrationStaging,
  };
}

import { ReactNode } from "react";
import { canAccess } from "./navigation";
import { OperationalState } from "./OperationalStates";

export interface RouteGuardProps {
  permissions: readonly string[];
  requiredPermission: string;
  routeLabel?: string;
  children: ReactNode;
}

export function RouteGuard({ permissions, requiredPermission, routeLabel = "Current route", children }: RouteGuardProps) {
  if (!canAccess(permissions, requiredPermission)) {
    return (
      <div className="route-guard" data-required-permission={requiredPermission}>
        <OperationalState
          kind="no-permission"
          title="No permission"
          detail={`${routeLabel} is hidden because the route guard did not find the required entitlement.`}
        />
      </div>
    );
  }
  return (
    <div className="route-guard" data-required-permission={requiredPermission} data-route-access="granted">
      {children}
    </div>
  );
}

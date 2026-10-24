import { createContext, useContext, useMemo } from "react";
import { resolvePlanFeatureFlags } from "../lib/planFeatures";

const PlanAccessContext = createContext({
  planKey: null,
  features: {},
  hasFeature: () => false,
});

export function PlanAccessProvider({ subscription, children }) {
  const value = useMemo(() => {
    const features = resolvePlanFeatureFlags(subscription);
    return {
      planKey: subscription?.plan_key || null,
      features,
      hasFeature: (featureKey) => features[featureKey] === true,
    };
  }, [subscription]);

  return (
    <PlanAccessContext.Provider value={value}>
      {children}
    </PlanAccessContext.Provider>
  );
}

export function usePlanAccess() {
  return useContext(PlanAccessContext);
}

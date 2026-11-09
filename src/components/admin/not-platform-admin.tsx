import { Link } from "@tanstack/react-router";
import { CenteredPanel } from "@/components/app/centered-panel";
import { Button } from "@/components/ui/button";

export function NotPlatformAdmin() {
  return (
    <CenteredPanel title="No access" description="Platform administration is only available to platform administrators.">
      <Button asChild className="w-full">
        <Link to="/select-business" search={{ choose: "1" }}>Go to my businesses</Link>
      </Button>
    </CenteredPanel>
  );
}

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/**
 * Placeholder for a nav entry that exists in the Platform Console's
 * structure but has no backend/data model behind it yet — shown rather
 * than omitted so the section is visible and honest about its status,
 * not a broken link or a page pretending to have real numbers.
 */
export function ComingSoon({ icon: Icon, title, description }: ComingSoonProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <Badge variant="secondary" className="bg-amber-50 text-amber-700">
            Coming soon
          </Badge>
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}

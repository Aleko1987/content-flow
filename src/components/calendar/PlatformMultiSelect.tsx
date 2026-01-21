import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown } from 'lucide-react';
import { PLATFORMS, type Platform } from '@/types/scheduled-post';

interface PlatformMultiSelectProps {
  value: Platform[];
  onChange: (platforms: Platform[]) => void;
  disabled?: boolean;
}

export const PlatformMultiSelect: React.FC<PlatformMultiSelectProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const togglePlatform = (platform: Platform) => {
    if (value.includes(platform)) {
      onChange(value.filter(p => p !== platform));
    } else {
      onChange([...value, platform]);
    }
  };

  const selectedLabels = value.length > 0
    ? value.map(p => PLATFORMS.find(pl => pl.key === p)?.label).join(', ')
    : 'Select platforms';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between bg-secondary/50"
          disabled={disabled}
        >
          <span className="truncate text-left flex-1">
            {value.length > 0 ? (
              <span className="flex items-center gap-1.5 flex-wrap">
                {value.slice(0, 3).map(p => {
                  const platform = PLATFORMS.find(pl => pl.key === p);
                  return (
                    <Badge key={p} variant="secondary" className="text-xs">
                      {platform?.icon} {platform?.label}
                    </Badge>
                  );
                })}
                {value.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{value.length - 3}
                  </Badge>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Select platforms</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 bg-popover border-border" align="start">
        <div className="space-y-1">
          {PLATFORMS.map(platform => (
            <label
              key={platform.key}
              className="flex items-center gap-3 p-2 rounded hover:bg-secondary/50 cursor-pointer transition-colors"
            >
              <Checkbox
                checked={value.includes(platform.key)}
                onCheckedChange={() => togglePlatform(platform.key)}
              />
              <span className="text-lg">{platform.icon}</span>
              <span className="text-sm">{platform.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

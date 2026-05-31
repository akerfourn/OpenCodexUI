/**
 * Renders a compact composer setting button backed by a menu.
 */
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { Button, ListItemIcon, Menu, MenuItem, Stack, Tooltip, Typography } from "@mui/material";
import { useState, type MouseEvent, type ReactNode } from "react";

type SettingMenuButtonProps<TValue extends string> = {
  icon: ReactNode;
  label: string;
  value: TValue;
  options: Array<{
    value: TValue;
    label: string;
    description?: string;
  }>;
  disabled?: boolean;
  onChange(value: TValue): void;
};

/**
 * Renders a compact composer setting button.
 *
 * @param props Component props.
 *
 * @returns Rendered setting button and menu.
 */
export function SettingMenuButton<TValue extends string>({
  icon,
  label,
  value,
  options,
  disabled = false,
  onChange
}: SettingMenuButtonProps<TValue>) {
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const isOpen = anchorElement !== null;
  const selectedOption = options.find((option) => option.value === value);
  const displayedLabel = selectedOption?.label ?? value;

  function handleOpen(event: MouseEvent<HTMLButtonElement>): void {
    setAnchorElement(event.currentTarget);
  }

  function handleClose(): void {
    setAnchorElement(null);
  }

  function handleSelect(nextValue: TValue): void {
    onChange(nextValue);
    setAnchorElement(null);
  }

  return (
    <>
      <Tooltip title={label}>
        <span>
          <Button
            className="composer-setting-button"
            type="button"
            variant="text"
            disabled={disabled}
            startIcon={icon}
            endIcon={<ExpandMoreRoundedIcon fontSize="small" />}
            onClick={handleOpen}
          >
            <Typography component="span" variant="body2" noWrap sx={{ minWidth: 0 }}>
              {displayedLabel}
            </Typography>
          </Button>
        </span>
      </Tooltip>
      <Menu
        anchorEl={anchorElement}
        open={isOpen}
        onClose={handleClose}
        slotProps={{ list: { dense: true } }}
      >
        {options.map((option) => {
          const iconContent = option.value === value ? icon : null;
          const descriptionContent = option.description !== undefined &&
            option.description.length > 0 ? (
              <Typography variant="caption" color="text.secondary">
                {option.description}
              </Typography>
            ) : null;

          return (
            <MenuItem
              key={option.value}
              selected={option.value === value}
              onClick={() => {
                handleSelect(option.value);
              }}
            >
              <ListItemIcon sx={{ minWidth: 30 }}>
                {iconContent}
              </ListItemIcon>
              <Stack sx={{ minWidth: 0 }}>
                <Typography variant="body2">{option.label}</Typography>
                {descriptionContent}
              </Stack>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

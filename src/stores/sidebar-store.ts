import { create } from "zustand";
import { persist } from "zustand/middleware";

type SidebarStore = {
  isOpen: boolean;
  collapsed: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  toggleCollapsed: () => void;
};

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      isOpen: false,
      collapsed: false,
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      setOpen: (open: boolean) => set({ isOpen: open }),
      toggleCollapsed: () =>
        set((state) => ({ collapsed: !state.collapsed })),
    }),
    {
      name: "clinica-organizada:sidebar",
      partialize: (s) => ({ collapsed: s.collapsed }),
    },
  ),
);

declare global {
  interface Window {
    EngagingNetworks?: {
      feeCover?: any;
      require?: {
        _defined?: {
          enDependencies?: {
            dependencies?: {
              parseDependencies: (dependencies: object[]) => void;
            };
          };
        };
      };
      dependencies?: any[];
    };
    pageJson?: {
      giftProcess?: any;
      pageCount?: number;
      pageNumber?: number;
      campaignPageId?: number;
      clientId?: number;
      pageType?: string;
    };
    confetti: (options: {
      startVelocity?: number;
      spread?: number;
      ticks?: number;
      zIndex?: number;
      useWorker?: boolean;
      colors?: string[];
      particleCount?: number;
      origin?: {
        x: number;
        y: number;
      };
    }) => void;
  }
}

export {};

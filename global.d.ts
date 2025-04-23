declare global {
  interface Window {
    EngagingNetworks?: {
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
  }
}

export {};

export type RefreshAccessToken = () => Promise<string | null>;

class TokenRefreshManager {
  private inFlight: Promise<string | null> | null = null;

  run(refresh: RefreshAccessToken) {
    if (!this.inFlight) {
      this.inFlight = refresh().finally(() => {
        this.inFlight = null;
      });
    }

    return this.inFlight;
  }
}

export const tokenRefreshManager = new TokenRefreshManager();

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiRequest,
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  setAuthTokens,
} from '../services/apiClient';
import type { AuthTokenResponse, UserProfile } from '../types/api';

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, organisationSlug?: string) => Promise<UserProfile>;
  register: (payload: {
    email: string;
    full_name: string;
    password: string;
    organisation_name?: string;
    organisation_slug?: string;
    job_title?: string;
    department?: string;
  }) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const profile = await apiRequest<UserProfile>('/auth/me');
      setUser(profile);
    } catch {
      clearAuthTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = async (
    email: string,
    password: string,
    organisationSlug?: string
  ): Promise<UserProfile> => {
    const data = await apiRequest<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        organisation_slug: organisationSlug || undefined,
      }),
    });
    setAuthTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload: {
    email: string;
    full_name: string;
    password: string;
    organisation_name?: string;
    organisation_slug?: string;
    job_title?: string;
    department?: string;
  }): Promise<UserProfile> => {
    const data = await apiRequest<AuthTokenResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    return data.user;
  };

  const logout = async (): Promise<void> => {
    const refreshToken = getRefreshToken();
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // Ignore network error during signout
    } finally {
      clearAuthTokens();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}


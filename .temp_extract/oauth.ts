        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Decodificar o state para obter o redirectUri original
      let redirectTo = "/";
      try {
        const decodedState = Buffer.from(state, 'base64').toString('utf-8');
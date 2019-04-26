import noop from 'lodash/noop';
import {
  checkRendering,
  createDocumentationMessageGenerator,
} from '../../lib/utils';
import {
  Renderer,
  RenderOptions,
  WidgetFactory,
  SearchParameters,
} from '../../types';
import voiceSearchHelper, {
  VoiceListeningState,
  ToggleListening,
} from '../../lib/voiceSearchHelper';

const withUsage = createDocumentationMessageGenerator({
  name: 'voice-search',
  connector: true,
});

export type VoiceSearchConnectorParams = {
  searchAsYouSpeak: boolean;
  language?: string;
  additionalQueryParameters?: (params: {
    query: string;
  }) => Partial<SearchParameters> | void;
};

export interface VoiceSearchRenderOptions<T> extends RenderOptions<T> {
  isBrowserSupported: boolean;
  isListening: boolean;
  toggleListening: ToggleListening;
  voiceListeningState: VoiceListeningState;
}

export type VoiceSearchRenderer<T> = Renderer<
  VoiceSearchRenderOptions<VoiceSearchConnectorParams & T>
>;

export type VoiceSearchWidgetFactory<T> = WidgetFactory<
  VoiceSearchConnectorParams & T
>;

export type VoiceSearchConnector = <T>(
  renderFn: VoiceSearchRenderer<T>,
  unmountFn?: () => void
) => VoiceSearchWidgetFactory<T>;

const connectVoiceSearch: VoiceSearchConnector = (
  renderFn,
  unmountFn = noop
) => {
  checkRendering(renderFn, withUsage());

  return widgetParams => {
    const render = ({
      isFirstRendering,
      instantSearchInstance,
      voiceSearchHelper: {
        isBrowserSupported,
        isListening,
        toggleListening,
        getState,
      },
    }) => {
      renderFn(
        {
          isBrowserSupported: isBrowserSupported(),
          isListening: isListening(),
          toggleListening,
          voiceListeningState: getState(),
          widgetParams,
          instantSearchInstance,
        },
        isFirstRendering
      );
    };

    const {
      searchAsYouSpeak,
      language,
      additionalQueryParameters,
    } = widgetParams;

    return {
      init({ helper, instantSearchInstance }) {
        (this as any)._refine = (() => {
          let previousQuery: string | undefined;
          const setQueryAndSearch = (query: string) => {
            if (query !== helper.state.query) {
              previousQuery = helper.state.query;
              if (typeof additionalQueryParameters === 'function') {
                const queryLanguages = language
                  ? [language.split('-')[0]]
                  : undefined;
                helper.setState(
                  helper.state.setQueryParameters({
                    queryLanguages,
                    ignorePlurals: true,
                    removeStopWords: true,
                    optionalWords: query,
                    ...additionalQueryParameters({ query }),
                  })
                );
              }
              helper.setQuery(query);
            }
            if (
              typeof previousQuery !== 'undefined' &&
              previousQuery !== query
            ) {
              helper.search();
            }
          };
          return setQueryAndSearch;
        })();
        (this as any)._voiceSearchHelper = voiceSearchHelper({
          searchAsYouSpeak,
          language,
          onQueryChange: query => (this as any)._refine(query),
          onStateChange: () => {
            render({
              isFirstRendering: false,
              instantSearchInstance,
              voiceSearchHelper: (this as any)._voiceSearchHelper,
            });
          },
        });
        render({
          isFirstRendering: true,
          instantSearchInstance,
          voiceSearchHelper: (this as any)._voiceSearchHelper,
        });
      },
      render({ instantSearchInstance }) {
        render({
          isFirstRendering: false,
          instantSearchInstance,
          voiceSearchHelper: (this as any)._voiceSearchHelper,
        });
      },
      dispose({ state }) {
        unmountFn();
        let newState = state;
        if (typeof additionalQueryParameters === 'function') {
          const additional = additionalQueryParameters({ query: '' });
          const toReset = additional
            ? Object.keys(additional).reduce((acc, current) => {
                acc[current] = undefined;
                return acc;
              }, {})
            : {};
          newState = state.setQueryParameters({
            queryLanguages: undefined,
            ignorePlurals: undefined,
            removeStopWords: undefined,
            optionalWords: undefined,
            ...toReset,
          });
        }

        return newState.setQuery('');
      },
      getWidgetState(uiState, { searchParameters }) {
        const query = searchParameters.query;

        if (query === '' || (uiState && uiState.query === query)) {
          return uiState;
        }

        return {
          ...uiState,
          query,
        };
      },
      getWidgetSearchParameters(searchParameters, { uiState }) {
        return searchParameters.setQuery(uiState.query || '');
      },
    };
  };
};

export default connectVoiceSearch;

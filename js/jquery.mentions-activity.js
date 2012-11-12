/*
 * Mentions Input use for ExoPlatform
 * Version 1.0.
 * Written by: Vu Duy Tu
 *
 * Using underscore.js, jquery-1.7.2.js
 *
 */

(function($, _, undefined) {
  // Keyword map
  var KEY = {
    BACKSPACE : 8,
    TAB : 9,
    RETURN : 13,
    ESC : 27,
    LEFT : 37,
    UP : 38,
    RIGHT : 39,
    DOWN : 40,
    MENTION : 64,
    COMMA : 188,
    SPACE : 32,
    HOME : 36,
    END : 35
  };
// Default settings
  var defaultSettings = {
    triggerChar : '@',
    onDataRequest : $.noop,
    minChars : 1,
    showAvatars : true,
    elastic : true,
    elasticStyle : {},
    idAction : "",
    classes : {
      autoCompleteItemActive : "active"
    },
    cacheResult : {
      hasUse : true,
      live : 30000 // MiniSeconds
    },
    templates : {
      wrapper : _.template('<div class="mentions-activity"></div>'),
      autocompleteList : _.template('<div class="autocomplete-menu"></div>'),
      autocompleteListItem : _.template('<li data-ref-id="<%= id %>" data-ref-type="<%= type %>" data-display="<%= display %>"><%= content %></li>'),
      autocompleteListItemAvatar : _.template('<img  src="<%= avatar %>" />'),
      autocompleteListItemIcon : _.template('<div class="icon <%= icon %>"></div>'),
      mentionItemSyntax : _.template('<%=name%>(<%=id%>)'),
      mentionItemHighlight : _.template('<strong><span><%= value %></span></strong>')
    }
  };

  function log(v) {
    window.console.log(v);
  }

  function cacheMention() {
    var mentionCache = {
      id : '',
      val : '',
      mentions : [],
      data : ''
    };
    return mentionCache;
  }

  
  var utils = {
    highlightTerm : function(value, term) {
      if (!term && !term.length) {
        return value;
      }
      return value.replace(new RegExp("(?![^&;]+;)(?!<[^<>]*)(" + term + ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<b>$1</b>");
    },
    getSimpleValue : function(val) {
      return val.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
                .replace(/<span.*?>/gi, '').replace(/<\/span>/gi, '')
                .replace(/<br.*?>/g, '').replace(/\n/g, '<br />');
    },
    getCursorIndexOfText : function(before, after) {
      var t = 0;
      for ( var i = 0; i < after.length; ++i) {
        if (before[i] === after[i]) {
          ++t;
        } else {
          break;
        }
      }
      if (t >= 0) {
        if ($.trim(before.substr(t)).toLowerCase().indexOf('<span') === 0) {
          return t;
        }
      }
      return -1;
    },
    getIndexChange : function(before, after) {// before , after
      var info = {
        from : (before.length > 0) ? before.length : 0,
        to : after.length
      };
      for ( var i = 0; i < before.length; ++i) {
        if (before[i] != after[i]) {
          info.from = i - 1;
          break;
        }
      }
      if (before.length > 0) {
        var t = after.length - 1;
        for ( var i = before.length - 1; i >= 0; --i) {
          if (before[t] != after[i]) {
            info.to = t + 1;
            break;
          }
          --t;
        }
      }
      return info;
    },
    escapeHtml : function(str) {
      return _.escape(str);
    },
    isIE : ($.browser.msie),
    isFirefox : ($.browser.mozilla)
  };

  var mentions_activity = function(settings) {

    var jqTarget, jqMainInput, jqAutocompleteList, jqItemAutoComplateActive;
    var mentionsCollection = [];
    var autocompleteItemCollection = {};
    var inputBuffer = [];
    var currentDataQuery = '';

    settings = $.extend(true, {}, defaultSettings, settings);

    KEY.MENTION = settings.triggerChar.charCodeAt(0);

    function initInterfaceInput() {

      if (jqMainInput.attr('data-mentions') == 'true') {
        return;
      }

      jqMainInput.wrapAll($(settings.templates.wrapper()));

      jqMainInput.attr('data-mentions', 'true');
      jqMainInput.on('keydown', onKeyDownInput);
      jqMainInput.on('keypress', onKeyPressInput);
      jqMainInput.on('input', onInputInput);
      jqMainInput.on('click', onClickInput);
      jqMainInput.on('paste', onPasteInput);
      jqMainInput.on('blur', onBlurInput);

      if (settings.elastic) {
        jqMainInput.elastic(settings);
      }

    }

    function initAutocomplete() {
      jqAutocompleteList = $(settings.templates.autocompleteList());
      jqAutocompleteList.appendTo(jqMainInput.parent());
      jqAutocompleteList.delegate('li', 'mousedown', onAutoCompleteItemClick);
    }

    function updateValues() {
      var syntaxMessage = getInputBoxValue();

      _.each(mentionsCollection, function(mention) {
        var textSyntax = settings.templates.mentionItemSyntax(mention);
        syntaxMessage = syntaxMessage.replace(mention.value, textSyntax);
      });

      jqMainInput.data('messageText', syntaxMessage);
    }

    function resetBuffer() {
      inputBuffer = [];
    }

    function updateMentionsCollection() {
      var inputText = getInputBoxValue();

      mentionsCollection = _.reject(mentionsCollection, function(mention, index) {
        return !mention.value || inputText.indexOf(mention.value) == -1;
      });
      mentionsCollection = _.compact(mentionsCollection);
    }

    function addMention(mention) {

      var currentMessage = getInputBoxFullValue();

      // Using a regex to figure out positions
      var regex = new RegExp("\\" + settings.triggerChar + currentDataQuery, "gi");
      regex.exec(currentMessage);

      var startCaretPosition = regex.lastIndex - currentDataQuery.length - 1;
      var currentCaretPosition = regex.lastIndex;

      var start = currentMessage.substr(0, startCaretPosition);
      var end = currentMessage.substr(currentCaretPosition, currentMessage.length);
      var startEndIndex = (start + mention.value).length + 1;

      mentionsCollection.push(mention);

      // Cleaning before inserting the value, otherwise auto-complete would be
      // triggered with "old" inputbuffer
      resetBuffer();
      currentDataQuery = '';
      hideAutoComplete();

      // Mentions & syntax message
      var updatedMessageText = start + addItemMention(mention.value) + end;

      jqMainInput.val(updatedMessageText);

      initClickMention();
      setCaratPosition(jqMainInput);

    }


    function addItemMention(value) {
      var val = '<span contenteditable="false">' + value + '<span class="icon"' + ((utils.isFirefox) ? 'contenteditable="true"' : '') + '>x</span></span>'
          + '&nbsp;<div id="cursorText"></div>';
      return val;
    }

    function initClickMention() {
      var sp = jqMainInput.find('> span');
      if (sp.length > 0) {
        $.each(sp, function(index, item) {
          var sp = $(item).find('span');
          sp.data('indexMS', {
            'indexMS' : index
          }).off('click');
          sp.on('click', function(e) {
            var t = $(this).data('indexMS').indexMS;
            mentionsCollection.splice(t, 1);
            $(this).parent().remove();
            updateValues();
            saveCacheData();
            initClickMention();
            e.stopPropagation();
          });
          $(item).on('click', function() {
            var selection = getSelection();
            if (selection) {
              try {
                var range = document.createRange();
                range.selectNodeContents(this);
                range.selectNode(this);

                selection.removeAllRanges();
                selection.addRange(range);
              } catch(err) {}
            }
          });
        });
      }
    }

    function getSelection() {
      var selection = null;
      if (window.getSelection) {
        selection = window.getSelection();
      } else if (document.getSelection) {
        selection = document.getSelection();
      } else if (document.selection) {
        selection = document.selection;
      }
      return selection;
    }

    function setCaratPosition(inputField) {
      if (inputField) {
        var cursorText = inputField.find('#cursorText');
        if (inputField.val().length != 0) {
          
          var elm = inputField[0];
          var selection = getSelection();
          if (selection) {
            cursorText.attr('contenteditable', 'true').css({
              'display' : 'inline',
              'height' : '14px'
            }).html('&nbsp;&nbsp;&nbsp;');
            cursorText.focus();
            try{
              var range = document.createRange();
              range.selectNode(cursorText[0]);
              range.selectNodeContents(cursorText[0]);

              selection.removeAllRanges();
              selection.addRange(range);
            }catch(err) {
              inputField.focus();
            }
          }
        }
        cursorText.remove();
        inputField.focus();
        updateValues();
      }
    }
    
    function getInputBoxFullValue() {
      return $.trim(jqMainInput.value());
    }

    function getInputBoxValue() {
      return $.trim(jqMainInput.val());
    }

    function onAutoCompleteItemClick(e) {
      var elmTarget = $(this);
      var mention = autocompleteItemCollection[elmTarget.attr('data-uid')];
      addMention(mention);
      saveCacheData();
      return false;
    }

    function onPasteInput(e) {
      var before = $.trim(jqMainInput.value());
      jqMainInput.animate({
        'cursor' : 'wait'
      }, 100, function() {
        var after = $.trim(jqMainInput.value());
        var info = utils.getIndexChange(before, after);
        var text = after.substr(info.from, info.to);
        var nt = text.replace(new RegExp("(<[a-z0-9].*?>)(.*)(</[a-z0-9].*?>)", "gi"), "$2");
        if (nt.length < text.length) {
          after = after.substr(0, info.from) + $('<div/>').html(text).text() + after.substr(info.to) + ' <div id="cursorText"></div>';
          jqMainInput.val(after);
          setCaratPosition(jqMainInput);
        }
        jqMainInput.css('cursor', 'text');
        jqMainInput.parent().find('.placeholder').hide();
      });

      // 
      return;
    }

    function onClickInput(e) {
      resetBuffer();
    }

    function onBlurInput(e) {
      hideAutoComplete();
      saveCacheData();
      var plsd = $(this).parent().find('div.placeholder:first');
      if (plsd.length > 0 && $.trim(jqMainInput.val()).length === 0) {
        plsd.show();
      }
    }

    function onInputInput(e) {
      updateValues();
      updateMentionsCollection();
      hideAutoComplete();

      var triggerCharIndex = _.lastIndexOf(inputBuffer, settings.triggerChar);
      if (triggerCharIndex > -1) {
        currentDataQuery = $.trim(inputBuffer.slice(triggerCharIndex + 1).join(''));

        _.defer(_.bind(doSearch, this, currentDataQuery));
      }
    }

    function onKeyPressInput(e) {
      if (e.keyCode !== KEY.BACKSPACE) {
        var typedValue = String.fromCharCode(e.which || e.keyCode);
        inputBuffer.push(typedValue);
        // Hark IE
        if (utils.isIE) {
          onInputInput(e);
        }
      }
      var plsd = $(this).parent().find('div.placeholder:first');
      if (plsd.length > 0) {
        plsd.hide();
      }
    }

    function onKeyDownInput(e) {
      // Run without IE
      if (String.fromCharCode(e.which || e.keyCode) === settings.triggerChar) {
        onInputInput(e);
      }

      if (e.keyCode == KEY.LEFT || e.keyCode == KEY.RIGHT || e.keyCode == KEY.HOME || e.keyCode == KEY.END) {
        _.defer(resetBuffer);
        // Hack IE9.
        if (utils.isIE && window.parseInt($.browser.version) == 9) {
          _.defer(updateValues);
        }
        return;
      }
      
      if (e.keyCode == KEY.SPACE) {
        inputBuffer = [];
      }
      if (e.keyCode == KEY.BACKSPACE) {
        inputBuffer.splice((inputBuffer.length - 1), 1);
        if (utils.isIE) {
          if (inputBuffer.length > 1 || (inputBuffer.length == 1 && $.browser.version < 9)) {
            onInputInput();
          } else {
            hideAutoComplete();
          }
        }
        var plsd = $(this).parent().find('div.placeholder:first');
        if (plsd.length > 0 && $.trim(jqMainInput.val()).length === 1) {
          plsd.show();
        } else {
          var before = jqMainInput.value();
          jqMainInput.animate({
            'cursor' : 'wait'
          }, 100, function() {
            var after = jqMainInput.value();
            var delta = before.length - after.length;
            var textSizeMention = 63;
            if (delta > textSizeMention) {
              var i = utils.getCursorIndexOfText(before, after);
              if (i >= 0) {
                after = after.substr(0, i) + ' @<div id="cursorText"></div>' + after.substr(i, after.length);
                after = after.replace(/  @/g, ' @');
                jqMainInput.val(after);
                autoSetKeyCode(jqMainInput);
                setCaratPosition(jqMainInput);
              }
            } else if (delta == 1 && after[after.length - 1] === '@') {
              autoSetKeyCode(jqMainInput);
            }
            jqMainInput.css('cursor', 'text');
          });
        }
        return;
      }
      // Hark IE can not update to the data value after add mentions.
      if (utils.isIE && mentionsCollection.length) {
        updateValues();
      }
      
      if (!jqAutocompleteList.is(':visible')) {
        return true;
      }
      
      switch (e.keyCode) {
        case KEY.UP:
        case KEY.DOWN:
          var jqCurrentItem = null;
          if (e.keyCode == KEY.DOWN) {
            if (jqItemAutoComplateActive && jqItemAutoComplateActive.length) {
              jqCurrentItem = jqItemAutoComplateActive.next();
            } else {
              jqCurrentItem = jqAutocompleteList.find('li:first');
            }
          } else {
            jqCurrentItem = $(jqItemAutoComplateActive).prev();
          }
          
          if (jqCurrentItem.length) {
            selectAutoCompleteItem(jqCurrentItem);
          }
          return false;
          
        case KEY.RETURN:
        case KEY.TAB:
          if (jqItemAutoComplateActive && jqItemAutoComplateActive.length) {
            jqItemAutoComplateActive.trigger('mousedown');
            e.stopPropagation();
            return false;
          }
        default: {
          return true;
        }
      }
      return true;
    }

    function autoSetKeyCode(elm) {
      try {
        resetBuffer();
        inputBuffer[0] = settings.triggerChar;
        if(utils.isIE && $.browser.version < 9) {
          onInputInput();
        } else {
          var e = jQuery.Event("keypress", {
            keyCode : KEY.MENTION,
            charCode : settings.triggerChar
          });
          var e1 = jQuery.Event("keydown", {
            keyCode : KEY.MENTION,
            charCode : settings.triggerChar
          });
          elm.triggerHandler(e);
          elm.trigger(e1);
        }
      } catch(err) {}
    }

    function processDropdown(query, results) {
      jqAutocompleteList.show();

      if (!results.length) {
        hideAutoComplete();
        return;
      }

      jqAutocompleteList.empty();
      var jqListItemDropDown = $("<ul>").appendTo(jqAutocompleteList).hide();

      $.each(results, function(index, item) {
        var itemUid = _.uniqueId('mention_');

        autocompleteItemCollection[itemUid] = _.extend({}, item, {
          value : item.name
        });

        var newItem = $(settings.templates.autocompleteListItem({
          'id' : utils.escapeHtml(item.id),
          'display' : utils.escapeHtml(item.name),
          'type' : utils.escapeHtml(item.type),
          'content' : (utils.highlightTerm(utils.escapeHtml((item.name + ' (' + item.id.replace('@', '') + ')')), query))
        })).attr('data-uid', itemUid);

        if (index === 0) {
          selectAutoCompleteItem(newItem);
        }

        if (settings.showAvatars) {
          var elmIcon;

          if (item.avatar) {
            elmIcon = $(settings.templates.autocompleteListItemAvatar({
              avatar : item.avatar
            }));
          } else {
            elmIcon = $(settings.templates.autocompleteListItemIcon({
              icon : item.icon
            }));
          }
          elmIcon.prependTo(newItem);
        }
        newItem = newItem.appendTo(jqListItemDropDown);
      });

      jqAutocompleteList.show();
      jqListItemDropDown.show();
    }

    function hideAutoComplete() {
      jqItemAutoComplateActive = null;
      jqAutocompleteList.empty().hide();
    }

    function selectAutoCompleteItem(jqItem) {
      jqItem.addClass(settings.classes.autoCompleteItemActive);
      jqItem.siblings().removeClass(settings.classes.autoCompleteItemActive);
      jqItemAutoComplateActive = jqItem;
    }

    function resetInput() {
      jqMainInput.val('');
      mentionsCollection = [];
      updateValues();
    }

    function doSearch(query) {
      if (query === '' || String(query) === 'undefined')  query = ' ';
      if (query.length >= settings.minChars) {
        if(settings.cacheResult.hasUse) {
          var data = getCaseSearch(query);
          if (data) {
            processDropdown(query, data);
          } else {
            search(query);
          }
          clearCaseSearch();
        } else {
          search(query);
        }
      }
    }

    function search(query) {
      settings.onDataRequest.call(this, 'search', query, function(responseData) {
        processDropdown(query, responseData);
        saveCaseSearch(query, responseData);
      });
    }

    function saveCaseSearch(id, obj) {
      if(settings.cacheResult.hasUse) {
        id = 'result' + ((id === ' ') ? '_20' : id);
        var data = jqMainInput.parent().data("CaseSearch");
        if (String(data) === "undefined") data = {};
        data[id] = obj;
        jqMainInput.parent().data("CaseSearch", data);
      }
    }

    function getCaseSearch(id) {
      id = 'result' + ((id === ' ') ? '_20' : id);
      var data = jqMainInput.parent().data("CaseSearch");
      return (String(data) === "undefined") ? data : data[id];
    }

    function clearCaseSearch() {
      jqMainInput.parent().stop().animate({
        'cursor' : 'none'
      }, settings.cacheResult.live, function() {
        $(this).data("CaseSearch", {});
      });
    }

    function saveCacheData() {
      var key = jqTarget.attr('id');
      if (key) {
        var parentForm = jqTarget.parents('form:first').parent();
        if (parentForm.length > 0) {
          var dataCache = parentForm.data(key);
          if (dataCache == null) {
            dataCache = new cacheMention();
          }
          dataCache.mentions = mentionsCollection;
          dataCache.val = getInputBoxFullValue();
          dataCache.data = mentionsCollection.length > 0 ? jqMainInput.data('messageText') : getInputBoxValue();
          parentForm.data(key, dataCache);
        }
      }
    }

    function updateCacheData() {
      var parentForm = jqTarget.parents('form:first').parent();
      var key = jqTarget.attr('id');
      if (key) {
        var dataCache = parentForm.data(key);
        if (dataCache == null) {
          resetInput();
        } else {
          mentionsCollection = dataCache.mentions;
          jqMainInput.val(dataCache.val);
          jqMainInput.data('messageText', dataCache.data);
          updateValues();
        }
      }
    }

    function clearCacheData() {
      var parentForm = jqTarget.parents('form:first').parent();
      var key = jqTarget.attr('id');
      if (key) {
        var dataCache = parentForm.data(key);
        if (dataCache != null) {
          parentForm.data(key, null);
        }
      }
    }

    function getTemplate() {
      return $('<div contenteditable="true" g_editable="true" class="ReplaceTextArea editable"></div>');
    }

    function initInput(id, target) {
      var id_ = "Display" + id;
      var displayInput = target.find('#' + id_);
      if (displayInput.length === 0) {
        displayInput = getTemplate().attr('id', id_);
        displayInput.appendTo(target);
      }
      displayInput.val = function(v) {
        if (v === null || typeof v === "undefined") {
          var temp = $(this).clone();
          temp.find('.icon').remove();
          return utils.getSimpleValue(temp.html());
        } else {
          if (typeof v === 'object') {
            $(this).html('').append(v);
          } else {
            $(this).html(v);
          }

        }
      };
      displayInput.value = function() {
        var val = $(this).html().replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/<br.*?>/g, '').replace(/\n/g, '<br />');
        return val;
      };
      return displayInput;
    }

    // Public methods
    return {
      init : function(domTarget) {
        window.jq = $;
        jqTarget = $(domTarget);
        jqTarget.css({
          'visibility' : 'hidden',
          'display' : 'none'
        });

        //
        jqTarget.val('');

        jqMainInput = initInput(jqTarget.attr('id'), jqTarget.parent());

        initInterfaceInput();
        initAutocomplete();
        updateCacheData();

        // add placeholder
        if ($.trim(jqMainInput.val()).length == 0) {
          var title = jqTarget.attr('title');
          title = (title && title.length > 0 ) ? title : "Enter some text...";
          var placeholder = $('<div class="placeholder">' + title + '</div>').attr('title', title);
          placeholder.on('click', function() {
            jqMainInput.focus();
          });
          placeholder.appendTo(jqMainInput.parent());
        }

        // action submit
        if (settings.idAction && settings.idAction.length > 0) {
          $('#' + settings.idAction).on('mousedown', function() {
            var value = mentionsCollection.length ? jqMainInput.data('messageText') : getInputBoxValue();

            value = value.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
            jqTarget.val(value);
            clearCacheData();
            resetInput();
          });
        }

        // prefill mentions
        if (settings.prefillMention) {
          addMention(settings.prefillMention);
        }
      },

      val : function(callback) {
        var value = mentionsCollection.length ? jqMainInput.data('messageText') : getInputBoxValue();
        if (!_.isFunction(callback)) {
          return value;
        }
        callback.call(this, value);
      },

      reset : function() {
        resetInput();
      },

      getMentions : function(callback) {
        if (!_.isFunction(callback)) {
          return ;
        }
        callback.call(this, mentionsCollection);
      }
    };
  };

  // elastic the mention content
  $.fn.extend({
    elastic : function(settings) {
      elasticStyle = settings.elasticStyle;
      if (elasticStyle && typeof elasticStyle === 'object') {
        return this.each(function() {
          var delta = parseInt(elasticStyle.maxHeight) - parseInt(elasticStyle.minHeight);
          $(this).css({
            'height' : elasticStyle.minHeight,
            'marginBottom' : (delta + 4) + 'px'
          });
          $(this).data('elasticStyle', {
            'maxHeight' : elasticStyle.maxHeight,
            'minHeight' : elasticStyle.minHeight,
            'delta' : delta
          }).on('focus keyup', function() {
            var maxH = $(this).data('elasticStyle').maxHeight;
            if ($(this).height() < parseInt(maxH)) {
              $(this).animate({
                'height' : maxH,
                'marginBottom' : '4px'
              }, 100, function() {});
            }
          }).on('blur', function() {
            var val = $.trim($(this).html());
            val = utils.getSimpleValue(val);
            if (val.length == 0) {
              $(this).animate({
                'height' : $(this).data('elasticStyle').minHeight,
                'marginBottom' : ($(this).data('elasticStyle').delta + 4) + 'px'
              }, 300, function() {});
            }
          });
        });
      }
    }
  });

  $.fn.mentionsActivity = function(method, settings) {

    var outerArguments = arguments;

    if (typeof method === 'object' || !method) {
      settings = method;
    }

    return this.each(function() {
      var instance = $.data(this, 'mentionsActivity') || $.data(this, 'mentionsActivity', new mentions_activity(settings));
      if (_.isFunction(instance[method])) {
        return instance[method].apply(this, Array.prototype.slice.call(outerArguments, 1));
      } else if (typeof method === 'object' || !method) {
        return instance.init.call(this, this);
      } else {
        $.error('Method ' + method + ' does not exist');
      }
    });
  };

})(jQuery, window.underscore);
